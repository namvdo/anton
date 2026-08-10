use nalgebra::Vector2;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::duffing::DuffingParams;
use crate::dynamical_systems::ExtendedState;
use crate::range::{clamp_pair, RANGE_LIMIT};
use crate::unstable_manifold::{ManifoldConfig, SaddlePoint, SaddleType, StopReason, Trajectory};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => {
        log(&format!($($t)*))
    }
}

macro_rules! console_error {
    ($($t:tt)*) => {
        error(&format!($($t)*))
    }
}

#[cfg(target_arch = "wasm32")]
fn get_time_secs() -> f64 {
    js_sys::Date::now() / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
fn get_time_secs() -> f64 {
    use std::time::Instant;
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DuffingTrajectoryRet {
    pub points: Vec<(f64, f64)>,
    pub stop_reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DuffingManifoldResult {
    pub plus: DuffingTrajectoryRet,
    pub minus: DuffingTrajectoryRet,
    pub saddle_point: (f64, f64),
    pub eigenvalue: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DuffingFixedPointResult {
    pub x: f64,
    pub y: f64,
    pub eigenvalues: (f64, f64),
    pub stability: String,
}

#[derive(Serialize, Deserialize)]
pub struct DuffingComputeResult {
    pub manifolds: Vec<DuffingManifoldResult>,
    pub fixed_points: Vec<DuffingFixedPointResult>,
}

/// Compute manifold for Duffing map
pub struct DuffingManifoldComputer {
    params: DuffingParams,
    config: ManifoldConfig,
}

impl DuffingManifoldComputer {
    pub fn new(params: DuffingParams, config: ManifoldConfig) -> Self {
        Self { params, config }
    }

    pub fn compute_direction(
        &self,
        saddle: &SaddlePoint,
        direction_sign: f64,
        target_points: &[Vector2<f64>],
    ) -> Result<Trajectory, String> {
        console_log!(
            "Duffing: Starting compute_direction with direction_sign={}",
            direction_sign
        );

        let n_period = saddle.period;

        if n_period == 0 {
            return Err("Period cannot be zero".to_string());
        }

        if !saddle.position.x.is_finite() || !saddle.position.y.is_finite() {
            return Err("Saddle position is invalid".to_string());
        }

        let spacing_tol = if saddle.saddle_type == SaddleType::DualRepeller {
            1e-3
        } else {
            self.config.spacing_tol
        };

        // Perturb along the eigenvector direction (tangent_2d)
        let vec_0 = saddle.position + direction_sign * self.config.perturb_tol * saddle.tangent_2d;

        if !vec_0.x.is_finite() || !vec_0.y.is_finite() {
            return Err("Initial perturbation produced invalid position".to_string());
        }

        // Use the normal from the saddle point (computed in from_2d_eigenvector)
        let initial_normal = saddle.normal;

        let state_0 = ExtendedState {
            pos: vec_0,
            normal: initial_normal,
        };

        let map_fn: Box<dyn Fn(ExtendedState, usize) -> Result<ExtendedState, String>> =
            if saddle.saddle_type == SaddleType::DualRepeller {
                console_log!("Duffing: Using inverse map (dual repeller)");
                Box::new(|state, n| self.params.extended_map_inverse(state, n))
            } else {
                console_log!("Duffing: Using forward map");
                Box::new(|state, n| self.params.extended_map(state, n))
            };

        let state_1 = match map_fn(state_0, n_period) {
            Ok(s) => s,
            Err(e) => {
                console_error!("Duffing: Initial map failed: {}", e);
                return Err(format!("Initial iteration failed: {}", e));
            }
        };

        let mut traj_add = vec![state_0, state_1];
        let mut vec_iter_old = state_1;

        let start_time = get_time_secs();
        let mut j = 1;
        let mut log_counter = 0;

        loop {
            let vec_iter = match map_fn(vec_iter_old, n_period) {
                Ok(v) => v,
                Err(e) => {
                    console_log!("Duffing: Stopping at iteration {} due to: {}", j, e);
                    return Ok(Trajectory {
                        points: traj_add,
                        stop_reason: StopReason::Converged,
                    });
                }
            };

            if log_counter % 100 == 0 {
                console_log!(
                    "Duffing iteration {}: {} points, pos: ({:.4}, {:.4})",
                    j,
                    traj_add.len(),
                    vec_iter.pos.x,
                    vec_iter.pos.y
                );
                log_counter = 0;
            }
            log_counter += 1;

            let dist_diff = (vec_iter.pos - vec_iter_old.pos).norm();

            if !dist_diff.is_finite() {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::Converged,
                });
            }

            let dist_stable = if target_points.is_empty() {
                f64::INFINITY
            } else {
                target_points
                    .iter()
                    .map(|tp| (vec_iter.pos - tp).norm())
                    .filter(|d| d.is_finite())
                    .fold(f64::INFINITY, |acc, d| if d < acc { d } else { acc })
            };

            if j > self.config.max_iter {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::MaxIterations,
                });
            }

            if traj_add.len() > self.config.max_points {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::MaxPoints,
                });
            }

            if dist_diff < self.config.conv_tol && j >= 30 {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::Converged,
                });
            }

            let practical_stable_tol = 0.01;
            if dist_stable <= practical_stable_tol {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::ApproachedTargetPoint,
                });
            }

            let elapsed = get_time_secs() - start_time;
            if elapsed > self.config.time_limit {
                return Ok(Trajectory {
                    points: traj_add,
                    stop_reason: StopReason::TimeExceeded,
                });
            }

            if dist_diff > spacing_tol || dist_diff.is_nan() {
                // Simple refinement: just add current point
                traj_add.push(vec_iter);
            } else {
                traj_add.push(vec_iter);
            }

            vec_iter_old = vec_iter;
            j += 1;
        }
    }

    pub fn compute_manifold(
        &self,
        saddle: &SaddlePoint,
        target_points: &[Vector2<f64>],
    ) -> Result<(Trajectory, Trajectory), String> {
        let traj_plus = self.compute_direction(saddle, 1.0, target_points)?;
        let traj_minus = self.compute_direction(saddle, -1.0, target_points)?;
        Ok((traj_plus, traj_minus))
    }
}

fn find_duffing_fixed_points(params: &DuffingParams) -> Vec<(f64, f64)> {
    let mut fixed_points = Vec::new();

    fixed_points.push((0.0, 0.0));

    let discriminant = params.a - params.b - 1.0;

    if discriminant > 0.0 {
        let x_fp = discriminant.sqrt();
        fixed_points.push((x_fp, x_fp));
        fixed_points.push((-x_fp, -x_fp));
    }

    console_log!("Duffing: Found {} fixed points", fixed_points.len());
    for (i, (x, y)) in fixed_points.iter().enumerate() {
        console_log!("  Fixed point {}: ({:.6}, {:.6})", i, x, y);
    }

    fixed_points
}

fn classify_duffing_stability(l1: f64, l2: f64) -> &'static str {
    let abs_l1 = l1.abs();
    let abs_l2 = l2.abs();

    if abs_l1 < 1.0 && abs_l2 < 1.0 {
        "Attractor"
    } else if abs_l1 > 1.0 && abs_l2 > 1.0 {
        "Repeller"
    } else {
        "Saddle"
    }
}

#[wasm_bindgen]
pub fn compute_duffing_manifold_simple(
    a: f64,
    b: f64,
    epsilon: f64,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> Result<JsValue, JsValue> {
    let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
    let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
    console_log!(
        "Computing Duffing manifold with a={}, b={}, epsilon={}",
        a,
        b,
        epsilon
    );

    let params = match DuffingParams::new(a, b, epsilon) {
        Ok(p) => p,
        Err(e) => {
            console_error!("Invalid Duffing parameters: {}", e);
            return Err(JsValue::from_str(&e));
        }
    };

    let fixed_points_raw = find_duffing_fixed_points(&params);

    let mut fixed_points_result = Vec::new();
    let mut all_fixed_points_pos = Vec::new();
    let mut unstable_points_indices = Vec::new();

    for &(x, y) in &fixed_points_raw {
        // Skip points outside display range
        if x < x_min || x > x_max || y < y_min || y > y_max {
            continue;
        }

        let pos = Vector2::new(x, y);
        let jac = params.jacobian(pos);
        let trace = jac.trace();
        let det = jac.determinant();
        let discriminant = trace * trace - 4.0 * det;

        let (l1, l2) = if discriminant >= 0.0 {
            let sqrt_disc = discriminant.sqrt();
            ((trace + sqrt_disc) / 2.0, (trace - sqrt_disc) / 2.0)
        } else {
            let real = trace / 2.0;
            let imag = (-discriminant).sqrt() / 2.0;
            let mag = (real * real + imag * imag).sqrt();
            (mag, mag)
        };

        let stability = classify_duffing_stability(l1, l2);

        console_log!(
            "Duffing fixed point ({:.4}, {:.4}): {} with eigenvalues ({:.4}, {:.4})",
            x,
            y,
            stability,
            l1,
            l2
        );

        fixed_points_result.push(DuffingFixedPointResult {
            x,
            y,
            eigenvalues: (l1, l2),
            stability: stability.to_string(),
        });

        all_fixed_points_pos.push(pos);

        if stability == "Saddle" || stability == "Repeller" {
            unstable_points_indices.push(fixed_points_result.len() - 1);
        }
    }

    console_log!(
        "Duffing: Will compute manifolds for {} unstable/saddle points",
        unstable_points_indices.len()
    );

    let mut manifolds_result = Vec::new();
    let config = ManifoldConfig::default();
    let computer = DuffingManifoldComputer::new(params, config);

    for idx in unstable_points_indices {
        let fp_info = &fixed_points_result[idx];
        let pos = Vector2::new(fp_info.x, fp_info.y);

        let saddle_type = if fp_info.stability == "Repeller" {
            SaddleType::DualRepeller
        } else {
            SaddleType::Regular
        };

        let l1 = fp_info.eigenvalues.0;
        let l2 = fp_info.eigenvalues.1;

        let unstable_lambda = if l1.abs() > l2.abs() { l1 } else { l2 };
        let v1 = 1.0;
        let v2 = unstable_lambda;
        let norm = (v1 * v1 + v2 * v2).sqrt();
        let eigenvector = if norm > 1e-10 {
            Vector2::new(v1 / norm, v2 / norm)
        } else {
            Vector2::new(1.0, 0.0)
        };

        let saddle_pt = SaddlePoint::from_2d_eigenvector(
            pos,
            eigenvector,
            1,
            unstable_lambda,
            saddle_type,
            None, // No attractor center
        );

        if let Ok((traj_plus, traj_minus)) =
            computer.compute_manifold(&saddle_pt, &all_fixed_points_pos)
        {
            console_log!(
                "Duffing manifold from ({:.4}, {:.4}): plus {} pts, minus {} pts",
                pos.x,
                pos.y,
                traj_plus.points.len(),
                traj_minus.points.len()
            );

            let plus_points: Vec<(f64, f64)> = traj_plus
                .points
                .iter()
                .filter(|s| s.pos.x.is_finite() && s.pos.y.is_finite())
                .map(|s| (s.pos.x, s.pos.y))
                .collect();

            let minus_points: Vec<(f64, f64)> = traj_minus
                .points
                .iter()
                .filter(|s| s.pos.x.is_finite() && s.pos.y.is_finite())
                .map(|s| (s.pos.x, s.pos.y))
                .collect();

            manifolds_result.push(DuffingManifoldResult {
                plus: DuffingTrajectoryRet {
                    points: plus_points,
                    stop_reason: format!("{:?}", traj_plus.stop_reason),
                },
                minus: DuffingTrajectoryRet {
                    points: minus_points,
                    stop_reason: format!("{:?}", traj_minus.stop_reason),
                },
                saddle_point: (pos.x, pos.y),
                eigenvalue: saddle_pt.eigenvalue,
            });
        }
    }

    let result = DuffingComputeResult {
        manifolds: manifolds_result,
        fixed_points: fixed_points_result,
    };

    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    match result.serialize(&serializer) {
        Ok(v) => Ok(v),
        Err(e) => {
            console_error!("Serialization error: {:?}", e);
            Err(JsValue::from_str("Failed to serialize result"))
        }
    }
}
