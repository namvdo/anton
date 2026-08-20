//! Pseudo-arclength continuation for periodic boundary-map branches.

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepOutcome {
    /// Corrector converged to a point on the same branch; lambda advanced
    Converged,
    /// Corrector failed (or jumped orbits), step shrunk, lambda not advanced
    Retry,
    /// Repeated failures even at minimum step
    Stalled,
    /// Stepped past the requested [lambda_min, lambda_max] range
    OutOfRange,
}

/// Iterate boundary map p times and returns the final point
fn iterate_boundary_p(
    system: &dyn DynamicalSystem,
    z: ExtendedPoint,
    p: usize,
) -> Option<ExtendedPoint> {
    let mut cur = z;

    for _ in 0..p {
        cur = boundary_map_generic(system, cur.x, cur.y, cur.nx, cur.ny);
        if !cur.is_finite() || !cur.is_bounded(1e10) {
            return None;
        }
    }
    Some(cur)
}

/// At (z, lambda), return the period-p residual H = E^p(z) - z in R^4
/// the state Jacobian D_zH = D_zE^p - I (4x4), and the parameter derivative
/// D_λH = ∂E^p/∂λ in R^4 by central finite difference

fn state_residual_jacobian<S, F>(
    z: &Vector4<f64>,
    lambda: f64,
    period: usize,
    build_system: &F,
    fd_h: f64,
) -> Option<(Vector4<f64>, Jacobian4x4, Vector4<f64>)>
where
    S: DynamicalSystem,
    F: Fn(f64) -> S,
{
    let system = build_system(lambda);
    let zp = ExtendedPoint::new(z[0], z[1], z[2], z[3]);

    let (mapped, dz_ep) = compose_boundary_map_n_times_generic(&system, zp, period);
    if !mapped.is_finite() {
        return None;
    }

    let h_res = Vector4::new(
        mapped.x - zp.x,
        mapped.y - zp.y,
        mapped.nx - zp.nx,
        mapped.ny - zp.ny,
    );

    let dz_h = dz_ep.subtract_identity();

    let sys_p = build_system(lambda + fd_h);
    let sys_m = build_system(lambda - fd_h);
    let mp = iterate_boundary_p(&sys_p, zp, period)?;
    let mm = iterate_boundary_p(&sys_m, zp, period)?;

    let da_h = Vector4::new(
        (mp.x - mm.x) / (2.0 * fd_h),
        (mp.y - mm.y) / (2.0 * fd_h),
        (mp.nx - mm.nx) / (2.0 * fd_h),
        (mp.ny - mm.ny) / (2.0 * fd_h),
    );

    Some((h_res, dz_h, da_h))
}

/// Initial branch tangent from the natural-continuation formula
fn initial_tangent(
    dz_h: &Jacobian4x4,
    da_h: &Vector4<f64>,
    lambda_increasing: bool,
) -> Option<Vector5<f64>> {
    let inv = dz_h.inverse()?;
    let mut v = [0.0f64; 4];
    for (i, value) in v.iter_mut().enumerate() {
        let mut s = 0.0;
        for j in 0..4 {
            s += inv.data[i][j] * da_h[j];
        }
        *value = -s;
    }
    let mut t = Vector5::new(v[0], v[1], v[2], v[3], 1.0);
    t /= t.norm();
    if (t[4] > 0.0) != lambda_increasing {
        t = -t;
    }
    Some(t)
}

/// Next tangent via bordered system: solve [D_zH | D_lambdaH ; t_prev^T] t = e5,
/// then normalize and orient to continue in the same direction as t_prev
/// the border makes this solvable through a fold, where D_zH alone is singular
fn compute_tangent(
    dz_h: &Jacobian4x4,
    da_h: &Vector4<f64>,
    prev_tangent: &Vector5<f64>,
) -> Option<Vector5<f64>> {
    let mut m = Matrix5::<f64>::zeros();
    for i in 0..4 {
        for j in 0..4 {
            m[(i, j)] = dz_h.data[i][j];
        }
        m[(i, 4)] = da_h[i]
    }
    for j in 0..5 {
        m[(4, j)] = prev_tangent[j];
    }
    let rhs = Vector5::new(0.0, 0.0, 0.0, 0.0, 1.0);
    let t = m.lu().solve(&rhs)?;
    if t.iter().any(|v| !v.is_finite() || t.norm() < 1e-30) {
        return None;
    }
    let t = t / t.norm();
    Some(if t.dot(prev_tangent) < 0.0 { -t } else { t })
}

/// Pseudo-arclength Keller continuation of the boundary map periodic orbits.
///
/// Parameterizes the branch by arclength s in the combined (z, λ) space, so λ is
/// a free unknown that may rise, peak, fall. The augmented 5x5 Newton system
/// stays non-singular at a quadric fold - where natural continuation's 4x4
/// Dz_H block goes singular -- so it rounds saddle-node turning points (e.g., the
/// a ≈ 0.595 topological bifurcation) instead of stalling

pub struct PseudoArclengthContinuation {
    pub z: Vector4<f64>,
    pub lambda: f64,
    /// Unit tangent (dz, dλ) in R^5 to to branch at the current point.
    pub tangent: Vector5<f64>,
    /// Arclength step magnitude (always > 0; direction lives in the tangent)
    pub ds: f64,
    pub period: usize,

    pub lambda_min: f64,
    pub lambda_max: f64,
    pub min_ds: f64,
    pub max_ds: f64,
    pub residual_threshold: f64,
    pub newton_max_iter: usize,
    pub newton_tol: f64,
    pub fd_h: f64,

    consecutive_fails: u32,
    pub(super) max_fails: u32,
}

impl PseudoArclengthContinuation {
    /// Seed from already converged orbit point. `lambda_increasing` sets the initial
    /// travel direction. `build_system(λ)` makes λ into a fresh system,
    /// e.g., `|a| HenonSystem::new(a, b, eps)`
    pub fn new<S, F>(
        seed: &ExtendedPoint,
        lambda0: f64,
        ds: f64,
        period: usize,
        lambda_increasing: bool,
        build_system: &F,
    ) -> Option<Self>
    where
        S: DynamicalSystem,
        F: Fn(f64) -> S,
    {
        let z = Vector4::new(seed.x, seed.y, seed.nx, seed.ny);
        let (_, dz_h, da_h) = state_residual_jacobian(&z, lambda0, period, build_system, 1e-6)?;
        let tangent = initial_tangent(&dz_h, &da_h, lambda_increasing)?;

        Some(Self {
            z,
            lambda: lambda0,
            tangent,
            ds: ds.abs().max(1e-6),
            period,
            lambda_min: f64::NEG_INFINITY,
            lambda_max: f64::INFINITY,
            min_ds: 1e-4,
            max_ds: 0.05,
            residual_threshold: DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
            newton_max_iter: 50,
            newton_tol: 1e-12,
            fd_h: 1e-6,
            consecutive_fails: 0,
            max_fails: 8,
        })
    }

    pub fn seed_point(&self) -> ExtendedPoint {
        ExtendedPoint::new(self.z[0], self.z[1], self.z[2], self.z[3])
    }

    pub fn d_lambda_ds(&self) -> f64 {
        self.tangent[4]
    }

    pub fn classify<S: DynamicalSystem>(&self, system: &S) -> (StabilityType, Vec<f64>) {
        let (_, jac) = compose_boundary_map_n_times_generic(system, self.seed_point(), self.period);
        classify_stability_reduced(&jac, Vector2::new(self.z[2], self.z[3])).unwrap_or_else(|err| {
            panic!("invalid periodic continuation state during reduced stability analysis: {err}")
        })
    }

    /// One predictor-corrector step along the branch
    pub fn step<S, F>(&mut self, build_system: &F) -> StepOutcome
    where
        S: DynamicalSystem,
        F: Fn(f64) -> S,
    {
        let w0 = Vector5::new(self.z[0], self.z[1], self.z[2], self.z[3], self.lambda);

        // predictor: step ds along the unit tangent
        let mut w = w0 + self.ds * self.tangent;

        // corrector: Newton on [H_p(z, λ) = 0; t * (w - w0) - ds = 0]

        let mut converged = false;
        for _ in 0..self.newton_max_iter {
            let z_cur = Vector4::new(w[0], w[1], w[2], w[3]);
            let lam_cur = w[4];

            let (h_res, dz_h, da_h) = match state_residual_jacobian(
                &z_cur,
                lam_cur,
                self.period,
                build_system,
                self.fd_h,
            ) {
                Some(v) => v,
                None => break,
            };

            let n_res = self.tangent.dot(&(w - w0)) - self.ds;
            if h_res.norm() < self.residual_threshold && n_res.abs() < self.newton_tol {
                converged = true;
                break;
            }

            let r = Vector5::new(h_res[0], h_res[1], h_res[2], h_res[3], n_res);

            // Augmented Jacobian: top-left D_zH, top-right D_λH, bottom row t^T
            let mut jm = Matrix5::<f64>::zeros();
            for i in 0..4 {
                for j in 0..4 {
                    jm[(i, j)] = dz_h.data[i][j];
                }
                jm[(i, 4)] = da_h[i];
            }
            for j in 0..5 {
                jm[(4, j)] = self.tangent[j];
            }

            let dw = match jm.lu().solve(&(-r)) {
                Some(d) => d,
                None => break,
            };

            if dw.iter().any(|v| !v.is_finite()) {
                break;
            }

            w += dw;

            let nn = (w[2] * w[2] + w[3] * w[3]).sqrt();
            if nn > 1e-12 {
                w[2] /= nn;
                w[3] /= nn;
            }

            if dw.norm() < self.newton_tol {
                let z_chk = Vector4::new(w[0], w[1], w[2], w[3]);

                if let Some((h2, _, _)) =
                    state_residual_jacobian(&z_chk, w[4], self.period, build_system, self.fd_h)
                {
                    let n2 = self.tangent.dot(&(w - w0)) - self.ds;
                    converged = h2.norm() < self.residual_threshold && n2.abs() < self.newton_tol;
                }
                break;
            }
        }

        let z_new = ExtendedPoint::new(w[0], w[1], w[2], w[3]);
        if !converged || !z_new.is_finite() || !z_new.is_bounded(100.0) {
            self.consecutive_fails += 1;
            self.ds = (self.ds * 0.5).max(self.min_ds);
            return if self.consecutive_fails >= self.max_fails {
                StepOutcome::Stalled
            } else {
                StepOutcome::Retry
            };
        }

        if w[4] < self.lambda_min || w[4] > self.lambda_max {
            return StepOutcome::OutOfRange;
        }

        let z_acc = Vector4::new(w[0], w[1], w[2], w[3]);
        if let Some((_, dz_h, da_h)) =
            state_residual_jacobian(&z_acc, w[4], self.period, build_system, self.fd_h)
        {
            if let Some(t_new) = compute_tangent(&dz_h, &da_h, &self.tangent) {
                self.tangent = t_new;
            }
        }

        self.z = z_acc;
        self.lambda = w[4];
        self.consecutive_fails = 0;
        self.ds = (self.ds * 1.3).min(self.max_ds);
        StepOutcome::Converged
    }
}

#[derive(Debug, Clone)]
pub struct BranchPoint {
    pub lambda: f64,
    pub point: ExtendedPoint,
    pub period: usize,
    pub stability: StabilityType,
    pub eigenvalues: Vec<f64>,
    pub d_lambda_ds: f64,
}

fn record_branch_point<S, F>(cont: &PseudoArclengthContinuation, build_system: &F) -> BranchPoint
where
    S: DynamicalSystem,
    F: Fn(f64) -> S,
{
    let sys = build_system(cont.lambda);
    let (stability, eigenvalues) = cont.classify(&sys);
    BranchPoint {
        lambda: cont.lambda,
        point: cont.seed_point(),
        period: cont.period,
        stability,
        eigenvalues,
        d_lambda_ds: cont.d_lambda_ds(),
    }
}

/// Follow one branch from `seed` by arclength until it leaves [lambda_min,
/// lambda_max], stalls, or hits `max_points`. Rounds folds; a saddle-node shows
/// up as a sign flip of `d_lambda_ds` between consecutive returned points.
pub fn follow_branch_arclength<S, F>(
    seed: &ExtendedPoint,
    lambda0: f64,
    ds: f64,
    period: usize,
    lambda_increasing: bool,
    lambda_min: f64,
    lambda_max: f64,
    max_points: usize,
    build_system: &F,
) -> Vec<BranchPoint>
where
    S: DynamicalSystem,
    F: Fn(f64) -> S,
{
    let mut cont = match PseudoArclengthContinuation::new(
        seed,
        lambda0,
        ds,
        period,
        lambda_increasing,
        build_system,
    ) {
        Some(c) => c,
        None => return Vec::new(),
    };
    cont.lambda_min = lambda_min;
    cont.lambda_max = lambda_max;

    let mut branch = vec![record_branch_point(&cont, build_system)];
    for _ in 0..max_points {
        match cont.step(build_system) {
            StepOutcome::Converged => branch.push(record_branch_point(&cont, build_system)),
            StepOutcome::Retry => continue,
            StepOutcome::Stalled | StepOutcome::OutOfRange => break,
        }
    }
    branch
}
