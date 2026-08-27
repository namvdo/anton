use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::geometric_offsets::ExtendedBoundaryPoint;
use crate::henon_extended_map::{forward_henon_extended_point, HenonExtendedPoint};
use crate::range::PhaseSpaceBounds;

const NORMAL_EPSILON: f64 = 1e-14;
const MIN_BOUNDARY_POINTS: usize = 8;
const MAX_BOUNDARY_POINTS: usize = 10_000;
const MAX_FORWARD_ITERATIONS: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct InvariantSetSeed {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct InvariantSetPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardInvariantPointSet {
    /// Zero is the sampled noise circle around the deterministic seed image.
    pub iteration: usize,
    pub points: Vec<ExtendedBoundaryPoint>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ForwardInvariantStopReason {
    RequestedIterationsCompleted,
    PointSetLeftDomain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardInvariantSetResult {
    pub seed: InvariantSetSeed,
    pub deterministic_image: InvariantSetPosition,
    pub epsilon: f64,
    pub boundary_point_count: usize,
    pub requested_iterations: usize,
    pub completed_iterations: usize,
    pub stop_reason: ForwardInvariantStopReason,
    pub point_sets: Vec<ForwardInvariantPointSet>,
}

// pub struct ForwardInvariantSetResult {
//     pub seed: InvariantSeed,
//     pub deterministic_image: InvariantSetPosition,
//     pub epsilon: f64,
// }

fn normalize_seed(seed: InvariantSetSeed) -> Result<InvariantSetSeed, String> {
    if ![seed.x, seed.y, seed.nx, seed.ny]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err("Invariant-set initial extended state must be finite".to_string());
    }
    let normal_length = seed.nx.hypot(seed.ny);
    if normal_length < NORMAL_EPSILON {
        return Err("Invariant-set initial normal must have nonzero length".to_string());
    }
    Ok(InvariantSetSeed {
        x: seed.x,
        y: seed.y,
        nx: seed.nx / normal_length,
        ny: seed.ny / normal_length,
    })
}

fn initial_noise_circle(
    deterministic_image: InvariantSetPosition,
    seed_normal: (f64, f64),
    epsilon: f64,
    boundary_point_count: usize,
) -> Vec<ExtendedBoundaryPoint> {
    let phase = seed_normal.1.atan2(seed_normal.0);
    (0..boundary_point_count)
        .map(|index| {
            let angle = phase + std::f64::consts::TAU * index as f64 / boundary_point_count as f64;
            let nx = angle.cos();
            let ny = angle.sin();
            ExtendedBoundaryPoint {
                x: deterministic_image.x + epsilon * nx,
                y: deterministic_image.y + epsilon * ny,
                nx,
                ny,
            }
        })
        .collect()
}

fn map_points_forward(
    points: &[ExtendedBoundaryPoint],
    a: f64,
    b: f64,
    epsilon: f64,
) -> Result<Vec<ExtendedBoundaryPoint>, String> {
    points
        .iter()
        .map(|point| {
            forward_henon_extended_point(
                HenonExtendedPoint {
                    x: point.x,
                    y: point.y,
                    nx: point.nx,
                    ny: point.ny,
                },
                a,
                b,
                epsilon,
            )
            .map(|mapped| ExtendedBoundaryPoint {
                x: mapped.x,
                y: mapped.y,
                nx: mapped.nx,
                ny: mapped.ny,
            })
        })
        .collect()
}

fn point_set_is_in_domain(points: &[ExtendedBoundaryPoint], bounds: PhaseSpaceBounds) -> bool {
    points.iter().all(|point| bounds.contains(point.x, point.y))
}

#[allow(clippy::too_many_arguments)]
pub fn compute_forward_invariant_set(
    seed: InvariantSetSeed,
    a: f64,
    b: f64,
    epsilon: f64,
    boundary_point_count: usize,
    iterations: usize,
    bounds: PhaseSpaceBounds,
) -> Result<ForwardInvariantSetResult, String> {
    let seed = normalize_seed(seed)?;
    if !bounds.contains(seed.x, seed.y) {
        return Err(
            "Invariant-set initial position must lie in the computation domain".to_string(),
        );
    }
    if !epsilon.is_finite() || epsilon <= 0.0 {
        return Err("Invariant-set noise radius must be positive and finite".to_string());
    }
    if !(MIN_BOUNDARY_POINTS..=MAX_BOUNDARY_POINTS).contains(&boundary_point_count) {
        return Err(format!(
            "Invariant-set boundary samples must lie between {MIN_BOUNDARY_POINTS} and {MAX_BOUNDARY_POINTS}"
        ));
    }
    if iterations == 0 || iterations > MAX_FORWARD_ITERATIONS {
        return Err(format!(
            "Invariant-set forward iterations must lie between 1 and {MAX_FORWARD_ITERATIONS}"
        ));
    }

    forward_henon_extended_point(
        HenonExtendedPoint {
            x: seed.x,
            y: seed.y,
            nx: seed.nx,
            ny: seed.ny,
        },
        a,
        b,
        0.0,
    )?;

    let deterministic_image = InvariantSetPosition {
        x: 1.0 - a * seed.x * seed.x + seed.y,
        y: b * seed.x,
    };
    let initial_points = initial_noise_circle(
        deterministic_image,
        (seed.nx, seed.ny),
        epsilon,
        boundary_point_count,
    );
    if !point_set_is_in_domain(&initial_points, bounds) {
        return Err("The initial noise-circle samples leave the computation domain".to_string());
    }

    let mut point_sets = vec![ForwardInvariantPointSet {
        iteration: 0,
        points: initial_points,
    }];
    let mut stop_reason = ForwardInvariantStopReason::RequestedIterationsCompleted;

    for iteration in 1..=iterations {
        let previous = point_sets
            .last()
            .ok_or("Invariant-set point history unexpectedly became empty")?;
        let mapped = map_points_forward(&previous.points, a, b, epsilon)?;
        if mapped.len() != boundary_point_count {
            return Err(
                "Pointwise invariant-set propagation changed sample cardinality".to_string(),
            );
        }
        if !point_set_is_in_domain(&mapped, bounds) {
            stop_reason = ForwardInvariantStopReason::PointSetLeftDomain;
            break;
        }
        point_sets.push(ForwardInvariantPointSet {
            iteration,
            points: mapped,
        });
    }

    let completed_iterations = point_sets.len().saturating_sub(1);
    Ok(ForwardInvariantSetResult {
        seed,
        deterministic_image,
        epsilon,
        boundary_point_count,
        requested_iterations: iterations,
        completed_iterations,
        stop_reason,
        point_sets,
    })
}

#[wasm_bindgen(js_name = "computeForwardInvariantSet")]
#[allow(clippy::too_many_arguments)]
pub fn compute_forward_invariant_set_js(
    seed_x: f64,
    seed_y: f64,
    seed_nx: f64,
    seed_ny: f64,
    a: f64,
    b: f64,
    epsilon: f64,
    boundary_point_count: usize,
    iterations: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> Result<JsValue, JsValue> {
    let bounds = PhaseSpaceBounds::try_new(x_min, x_max, y_min, y_max)
        .map_err(|error| JsValue::from_str(&error))?;
    let result = compute_forward_invariant_set(
        InvariantSetSeed {
            x: seed_x,
            y: seed_y,
            nx: seed_nx,
            ny: seed_ny,
        },
        a,
        b,
        epsilon,
        boundary_point_count,
        iterations,
        bounds,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to serialize invariant-set result: {error}"
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds() -> PhaseSpaceBounds {
        PhaseSpaceBounds::try_new(-10.0, 10.0, -10.0, 10.0).unwrap()
    }

    fn seed() -> InvariantSetSeed {
        InvariantSetSeed {
            x: 0.2,
            y: -0.1,
            nx: 0.6,
            ny: 0.8,
        }
    }

    #[test]
    fn initialization_maps_position_before_sampling_noise_circle() {
        let result = compute_forward_invariant_set(seed(), 0.4, 0.3, 0.1, 16, 1, bounds()).unwrap();
        let image = result.deterministic_image;
        assert!((image.x - 0.884).abs() < 1e-12);
        assert!((image.y - 0.06).abs() < 1e-12);
        assert_eq!(result.point_sets[0].points.len(), 16);
        let first = result.point_sets[0].points[0];
        assert!((first.nx - 0.6).abs() < 1e-12);
        assert!((first.ny - 0.8).abs() < 1e-12);
        for point in &result.point_sets[0].points {
            assert!(((point.x - image.x).hypot(point.y - image.y) - 0.1).abs() < 1e-12);
            assert!((point.nx.hypot(point.ny) - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn forward_propagation_is_pointwise_and_preserves_cardinality() {
        let result =
            compute_forward_invariant_set(seed(), 0.4, 0.3, 0.05, 64, 4, bounds()).unwrap();
        assert_eq!(result.completed_iterations, 4);
        assert_eq!(result.point_sets.len(), 5);
        for point_set in &result.point_sets {
            assert_eq!(point_set.points.len(), 64);
            for point in &point_set.points {
                assert!([point.x, point.y, point.nx, point.ny]
                    .iter()
                    .all(|value| value.is_finite()));
                assert!((point.nx.hypot(point.ny) - 1.0).abs() < 1e-12);
            }
        }
    }

    #[test]
    fn first_forward_sample_uses_transported_normal_and_noise_offset() {
        let axis_seed = InvariantSetSeed {
            x: 0.2,
            y: -0.1,
            nx: 1.0,
            ny: 0.0,
        };
        let result =
            compute_forward_invariant_set(axis_seed, 0.4, 0.3, 0.1, 16, 1, bounds()).unwrap();
        let source = result.point_sets[0].points[0];
        let mapped = result.point_sets[1].points[0];
        assert!(mapped.nx.abs() < 1e-12);
        assert!((mapped.ny - 1.0).abs() < 1e-12);
        assert!((mapped.x - (1.0 - 0.4 * source.x * source.x + source.y)).abs() < 1e-12);
        assert!((mapped.y - (0.3 * source.x + 0.1)).abs() < 1e-12);
    }

    #[test]
    fn invalid_inputs_fail_before_propagation() {
        assert!(compute_forward_invariant_set(
            InvariantSetSeed {
                nx: 0.0,
                ny: 0.0,
                ..seed()
            },
            0.4,
            0.3,
            0.1,
            32,
            3,
            bounds(),
        )
        .is_err());
        assert!(compute_forward_invariant_set(seed(), 0.4, 0.3, 0.0, 32, 3, bounds()).is_err());
        assert!(compute_forward_invariant_set(seed(), 0.4, 0.3, 0.1, 7, 3, bounds()).is_err());
        assert!(compute_forward_invariant_set(seed(), 0.4, 0.0, 0.1, 32, 3, bounds()).is_err());
    }

    #[test]
    fn propagation_stops_before_accepting_points_outside_domain() {
        let compact = PhaseSpaceBounds::try_new(-1.1, 1.1, -0.3, 0.3).unwrap();
        let result = compute_forward_invariant_set(
            InvariantSetSeed {
                x: 0.0,
                y: 0.0,
                nx: 1.0,
                ny: 0.0,
            },
            0.4,
            0.3,
            0.05,
            32,
            20,
            compact,
        )
        .unwrap();
        assert_eq!(
            result.stop_reason,
            ForwardInvariantStopReason::PointSetLeftDomain
        );
        assert!(result.completed_iterations < 20);
        assert!(result
            .point_sets
            .iter()
            .flat_map(|point_set| &point_set.points)
            .all(|point| compact.contains(point.x, point.y)));
    }
}
