//! Periodic-point search, correction, minimal-period verification, and deduplication.

use super::*;

pub(super) fn boundary_map_generic(
    system: &dyn DynamicalSystem,
    x: f64,
    y: f64,
    nx: f64,
    ny: f64,
) -> ExtendedPoint {
    let state = ExtendedState {
        pos: Vector2::new(x, y),
        normal: Vector2::new(nx, ny),
    };
    match system.extended_map(state, 1) {
        Ok(next) => ExtendedPoint {
            x: next.pos.x,
            y: next.pos.y,
            nx: next.normal.x,
            ny: next.normal.y,
        },
        Err(_) => ExtendedPoint {
            x: f64::NAN,
            y: f64::NAN,
            nx: f64::NAN,
            ny: f64::NAN,
        },
    }
}

pub(super) fn boundary_map_jacobian_generic(
    system: &dyn DynamicalSystem,
    x: f64,
    y: f64,
    nx: f64,
    ny: f64,
) -> Jacobian4x4 {
    let h = 1e-6;
    let vars = [x, y, nx, ny];
    let mut data = [[0.0; 4]; 4];

    for j in 0..4 {
        let mut vars_plus = vars;
        let mut vars_minus = vars;
        vars_plus[j] += h;
        vars_minus[j] -= h;

        let f_plus = boundary_map_generic(
            system,
            vars_plus[0],
            vars_plus[1],
            vars_plus[2],
            vars_plus[3],
        );
        let f_minus = boundary_map_generic(
            system,
            vars_minus[0],
            vars_minus[1],
            vars_minus[2],
            vars_minus[3],
        );

        let f_plus_arr = [f_plus.x, f_plus.y, f_plus.nx, f_plus.ny];
        let f_minus_arr = [f_minus.x, f_minus.y, f_minus.nx, f_minus.ny];

        for i in 0..4 {
            data[i][j] = (f_plus_arr[i] - f_minus_arr[i]) / (2.0 * h);
        }
    }

    Jacobian4x4 { data }
}

pub(super) fn compose_boundary_map_n_times_generic(
    system: &dyn DynamicalSystem,
    p: ExtendedPoint,
    n: usize,
) -> (ExtendedPoint, Jacobian4x4) {
    if n == 0 {
        return (p, Jacobian4x4::identity());
    }

    let mut accumulated_jacobian = boundary_map_jacobian_generic(system, p.x, p.y, p.nx, p.ny);
    let mut current = boundary_map_generic(system, p.x, p.y, p.nx, p.ny);

    for _ in 1..n {
        if !current.is_finite() || !current.is_bounded(1e10) {
            return (
                ExtendedPoint::new(f64::NAN, f64::NAN, f64::NAN, f64::NAN),
                Jacobian4x4::identity(),
            );
        }

        let jac_current =
            boundary_map_jacobian_generic(system, current.x, current.y, current.nx, current.ny);
        accumulated_jacobian = jac_current.multiply(&accumulated_jacobian);
        current = boundary_map_generic(system, current.x, current.y, current.nx, current.ny);
    }

    (current, accumulated_jacobian)
}

pub(super) fn find_boundary_periodic_point_davidchack_lai_generic(
    system: &dyn DynamicalSystem,
    x0: f64,
    y0: f64,
    nx_0: f64,
    ny_0: f64,
    period: usize,
    beta: Option<f64>,
    max_iter: usize,
    tol: f64, // tolerance for how small the correct step can be
    residual_threshold: f64,
) -> Option<ExtendedPoint> {
    let mut x = x0;
    let mut y = y0;
    let mut nx = nx_0;
    let mut ny = ny_0;

    let beta_val = beta.unwrap_or(0.0);

    for _ in 0..max_iter {
        if !x.is_finite()
            || !y.is_finite()
            || !nx.is_finite()
            || !ny.is_finite()
            || x.abs() > 100.0
            || y.abs() > 100.0
        {
            return None;
        }

        let current = ExtendedPoint::new(x, y, nx, ny);
        let (mapped, jac_fn) = compose_boundary_map_n_times_generic(system, current, period);

        if !mapped.is_finite() {
            return None;
        }

        let gx = mapped.x - x;
        let gy = mapped.y - y;
        let gnx = mapped.nx - nx;
        let gny = mapped.ny - ny;

        let g_norm = (gx * gx + gy * gy + gnx * gnx + gny * gny).sqrt();

        if g_norm < residual_threshold {
            return Some(current);
        }

        let jac_g = jac_fn.subtract_identity();
        let scaled_beta = beta_val * g_norm;

        let mut modified_jac = [[0.0; 4]; 4];
        for (i, modified_row) in modified_jac.iter_mut().enumerate() {
            for (j, cell) in modified_row.iter_mut().enumerate() {
                *cell = -jac_g.data[i][j];
            }
            modified_row[i] += scaled_beta;
        }
        let modified_jac = Jacobian4x4 { data: modified_jac };
        let jac_inv = match modified_jac.inverse() {
            Some(inv) => inv,
            None => return None,
        };

        let dx = jac_inv.data[0][0] * gx
            + jac_inv.data[0][1] * gy
            + jac_inv.data[0][2] * gnx
            + jac_inv.data[0][3] * gny;
        let dy = jac_inv.data[1][0] * gx
            + jac_inv.data[1][1] * gy
            + jac_inv.data[1][2] * gnx
            + jac_inv.data[1][3] * gny;
        let dnx = jac_inv.data[2][0] * gx
            + jac_inv.data[2][1] * gy
            + jac_inv.data[2][2] * gnx
            + jac_inv.data[2][3] * gny;
        let dny = jac_inv.data[3][0] * gx
            + jac_inv.data[3][1] * gy
            + jac_inv.data[3][2] * gnx
            + jac_inv.data[3][3] * gny;

        if !dx.is_finite() || !dy.is_finite() || !dnx.is_finite() || !dny.is_finite() {
            return None;
        }

        x += dx;
        y += dy;
        nx += dnx;
        ny += dny;

        let norm = (nx * nx + ny * ny).sqrt();
        if norm <= 1e-12 || !norm.is_finite() {
            return None;
        }
        nx /= norm;
        ny /= norm;

        let delta_norm = (dx * dx + dy * dy + dnx * dnx + dny * dny).sqrt();
        if delta_norm < tol {
            break;
        }
    }

    let final_point = ExtendedPoint::new(x, y, nx, ny);
    let (mapped, _) = compose_boundary_map_n_times_generic(system, final_point, period);

    let dist_sq = (mapped.x - x).powi(2)
        + (mapped.y - y).powi(2)
        + (mapped.nx - nx).powi(2)
        + (mapped.ny - ny).powi(2);

    if dist_sq <= residual_threshold * residual_threshold {
        Some(final_point)
    } else {
        None
    }
}

pub(super) fn verify_minimal_period_generic(
    system: &dyn DynamicalSystem,
    point: &ExtendedPoint,
    claimed_period: usize,
    residual_threshold: f64,
) -> bool {
    for divisor in 1..claimed_period {
        if claimed_period % divisor == 0 {
            let (mapped, _) = compose_boundary_map_n_times_generic(system, *point, divisor);
            let dist = (mapped.x - point.x).powi(2)
                + (mapped.y - point.y).powi(2)
                + (mapped.nx - point.nx).powi(2)
                + (mapped.ny - point.ny).powi(2);
            if dist <= residual_threshold * residual_threshold {
                return false;
            }
        }
    }
    true
}

pub(super) fn try_add_orbit_generic(
    system: &dyn DynamicalSystem,
    database: &mut PeriodicOrbitDatabase,
    fp: ExtendedPoint,
    period: usize,
    residual_threshold: f64,
) -> bool {
    if !fp.is_finite() {
        return false;
    }
    if !fp.is_bounded(100.0) {
        return false;
    }
    // Deduplicate using spatial (x,y) distance only — the same orbit can be
    // found from different initial normal vectors, yielding different (nx,ny)
    // but the same physical periodic point.
    if database.contains_spatial_point(&fp, 0.01) {
        return false;
    }
    if !verify_minimal_period_generic(system, &fp, period, residual_threshold) {
        return false;
    }

    let mut orbit_points = vec![BoundaryPoint { x: fp.x, y: fp.y }];
    let mut extended_orbit_points = vec![fp];
    let mut current = fp;

    for _ in 1..period {
        current = boundary_map_generic(system, current.x, current.y, current.nx, current.ny);
        orbit_points.push(BoundaryPoint {
            x: current.x,
            y: current.y,
        });
        extended_orbit_points.push(current);
    }

    let (_, jac_fn) = compose_boundary_map_n_times_generic(system, fp, period);
    let Ok((stability, eigenvalues)) =
        classify_stability_reduced(&jac_fn, Vector2::new(fp.nx, fp.ny))
    else {
        return false;
    };

    database.add_orbit(PeriodicOrbit {
        points: orbit_points,
        extended_points: extended_orbit_points,
        period,
        stability,
        eigenvalues,
    });
    true
}

pub fn find_all_boundary_periodic_orbits_generic(
    system: &dyn DynamicalSystem,
    max_period: usize,
    grid_size: usize,
    theta_grid_size: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> PeriodicOrbitDatabase {
    find_all_boundary_periodic_orbits_generic_with_threshold(
        system,
        max_period,
        grid_size,
        theta_grid_size,
        x_min,
        x_max,
        y_min,
        y_max,
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
    )
}

pub fn find_all_boundary_periodic_orbits_generic_with_threshold(
    system: &dyn DynamicalSystem,
    max_period: usize,
    grid_size: usize,
    theta_grid_size: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    residual_threshold: f64,
) -> PeriodicOrbitDatabase {
    let mut database = PeriodicOrbitDatabase::new();
    let residual_threshold = sanitize_residual_threshold(residual_threshold);

    let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
    let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
    let x_range = (x_min, x_max);
    let y_range = (y_min, y_max);
    let theta_range = (0.0, 2.0 * PI);

    for period in 1..=max_period {
        let gs = grid_size;
        let ts = theta_grid_size;

        log_message(&format!(
            "Searching period {} orbits (grid {}x{}x{})...",
            period, gs, gs, ts
        ));

        let mut found_count = 0;

        // stage 1: uniform grid search
        for i in 0..gs {
            for j in 0..gs {
                for k in 0..ts {
                    let x0 = x_range.0 + (x_range.1 - x_range.0) * (i as f64 + 0.5) / (gs as f64);
                    let y0 = y_range.0 + (y_range.1 - y_range.0) * (j as f64 + 0.5) / (gs as f64);
                    let theta = theta_range.0
                        + (theta_range.1 - theta_range.0) * (k as f64 + 0.5) / (ts as f64);
                    let nx0 = theta.cos();
                    let ny0 = theta.sin();

                    if let Some(fp) = find_boundary_periodic_point_davidchack_lai_generic(
                        system,
                        x0,
                        y0,
                        nx0,
                        ny0,
                        period,
                        None,
                        150,
                        1e-12,
                        residual_threshold,
                    ) {
                        if try_add_orbit_generic(
                            system,
                            &mut database,
                            fp,
                            period,
                            residual_threshold,
                        ) {
                            found_count += 1;
                        }
                    }
                }
            }
        }

        // stage 2: continuation — perturb known orbit points as seeds
        let known: Vec<ExtendedPoint> = database
            .orbits
            .iter()
            .flat_map(|o| o.extended_points.iter().copied())
            .collect();
        let perturbations = [0.01, -0.01, 0.005, -0.005];
        for ep in &known {
            for &dp in &perturbations {
                for &(dx, dy) in &[(dp, 0.0), (0.0, dp)] {
                    if let Some(fp) = find_boundary_periodic_point_davidchack_lai_generic(
                        system,
                        ep.x + dx,
                        ep.y + dy,
                        ep.nx,
                        ep.ny,
                        period,
                        None,
                        150,
                        1e-12,
                        residual_threshold,
                    ) {
                        if try_add_orbit_generic(
                            system,
                            &mut database,
                            fp,
                            period,
                            residual_threshold,
                        ) {
                            found_count += 1;
                        }
                    }
                }
            }
        }

        log_message(&format!(
            "Found {} orbits of period {}",
            found_count, period
        ));
    }

    log_message(&format!(
        "Total boundary map orbits: {}",
        database.total_count()
    ));
    database
}
