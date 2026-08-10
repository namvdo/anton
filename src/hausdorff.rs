use nalgebra::Vector2;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{
    HenonParams, ManifoldConfig, SaddlePoint, SaddleType, Trajectory, UnstableManifoldComputer,
};

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[cfg(not(target_arch = "wasm32"))]
fn log(s: &str) {
    println!("{}", s);
}

macro_rules! console_log {
    ($($t:tt)*) => {
        log(&format!($($t)*))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HausdorffResult {
    pub distance: f64,
    pub max_from_a: f64, // max distance from A to B
    pub max_from_b: f64, // max distance from B to A
    pub closest_pair: Vec<ClosestPair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClosestPair {
    pub point_a: (f64, f64),
    pub point_b: (f64, f64),
    pub distance: f64,
}

// find minimum distance from point to a set of points
pub fn point_to_set_distance(point: &Vector2<f64>, point_set: &[Vector2<f64>]) -> (f64, usize) {
    let mut min_dist = f64::INFINITY;
    let mut min_idx = 0;

    for (idx, set_point) in point_set.iter().enumerate() {
        let dist = (point - set_point).norm();
        if dist < min_dist {
            min_dist = dist;
            min_idx = idx;
        }
    }

    (min_dist, min_idx)
}

// compute directed Hausdorff distance from set A to set B
// returns max_{a in A} min_{b in B}  || a - b ||
pub fn directed_hausdorff(set_a: &[Vector2<f64>], set_b: &[Vector2<f64>]) -> (f64, usize, usize) {
    let mut max_min_dist = 0.0;
    let mut max_point_idx = 0;
    let mut cloest_in_b_idx = 0;

    for (idx_a, point_a) in set_a.iter().enumerate() {
        let (min_b, idx_b) = point_to_set_distance(point_a, set_b);

        if min_b > max_min_dist {
            max_min_dist = min_b;
            max_point_idx = idx_a;
            cloest_in_b_idx = idx_b;
        }
    }

    (max_min_dist, max_point_idx, cloest_in_b_idx)
}

// compute bidirectional Hausdorff distance between two point sets
pub fn compute_hausdorff_distance(
    manifold_a: &[Vector2<f64>],
    manifold_b: &[Vector2<f64>],
    num_closest_pairs: usize,
) -> Result<HausdorffResult, String> {
    if manifold_a.is_empty() || manifold_b.is_empty() {
        return Err("Cannot compute Hausdorff distance for empty manifold".to_string());
    }

    console_log!(
        "Computing Hausdorff distance between {} and {} points",
        manifold_a.len(),
        manifold_b.len()
    );

    let (dist_a_to_b, _, _) = directed_hausdorff(manifold_a, manifold_b);
    let (dist_b_to_a, _, _) = directed_hausdorff(manifold_b, manifold_a);

    let hausdorff_dist = dist_a_to_b.max(dist_b_to_a);

    console_log!(
        "Hausdorff distance = {:.6} (A→B: {:.6}, B→A: {:.6})",
        hausdorff_dist,
        dist_a_to_b,
        dist_b_to_a
    );

    // find k closest pairs for visualization
    let mut all_pairs: Vec<(f64, usize, usize)> = Vec::new();

    let sample_a: Vec<_> = if manifold_a.len() > 1000 {
        manifold_a
            .iter()
            .step_by(manifold_a.len() / 1000)
            .collect::<Vec<_>>()
    } else {
        manifold_a.iter().collect()
    };

    for (idx_a, point_a) in sample_a.iter().enumerate() {
        let (min_dist, idx_b) = point_to_set_distance(point_a, manifold_b);
        all_pairs.push((min_dist, idx_a, idx_b));
    }

    all_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let closest_pairs: Vec<ClosestPair> = all_pairs
        .iter()
        .take(num_closest_pairs.min(all_pairs.len()))
        .map(|(dist, idx_a, idx_b)| ClosestPair {
            point_a: (sample_a[*idx_a].x, sample_a[*idx_a].y),
            point_b: (manifold_b[*idx_b].x, manifold_b[*idx_b].y),
            distance: *dist,
        })
        .collect();
    Ok(HausdorffResult {
        distance: hausdorff_dist,
        max_from_a: dist_a_to_b,
        max_from_b: dist_b_to_a,
        closest_pair: closest_pairs,
    })
}

fn trajectory_to_points(trajectory: &Trajectory) -> Vec<Vector2<f64>> {
    trajectory
        .points
        .iter()
        .filter(|s| s.pos.x.is_finite() && s.pos.y.is_finite())
        .map(|s| s.pos)
        .collect()
}

// compute Hausdorff distance between stable and unstable manifold
#[wasm_bindgen]
pub fn compute_hausdorff_distance_between_manifolds(
    unstable_plus_js: JsValue,
    unstable_minus_js: JsValue,
    stable_plus_js: JsValue,
    stable_minus_js: JsValue,
    num_closest_pairs: usize,
) -> Result<JsValue, JsValue> {
    console_log!("Computing Hausdorff distance between manifolds");

    let parse_points = |js_val: JsValue| -> Result<Vec<Vector2<f64>>, String> {
        let points: Vec<(f64, f64)> = serde_wasm_bindgen::from_value(js_val)
            .map_err(|e| format!("Failed to parse points: {:?}", e))?;

        Ok(points
            .iter()
            .filter(|(x, y)| x.is_finite() && y.is_finite())
            .map(|(x, y)| Vector2::new(*x, *y))
            .collect())
    };

    let unstable_plus = parse_points(unstable_plus_js)?;
    let unstable_minus = parse_points(unstable_minus_js)?;
    let stable_plus = parse_points(stable_plus_js)?;
    let stable_minus = parse_points(stable_minus_js)?;

    console_log!(
        "Parsed: U+ {} pts, U- {} pts, S+ {} pts, S- {} pts",
        unstable_plus.len(),
        unstable_minus.len(),
        stable_plus.len(),
        stable_minus.len()
    );

    let mut unstable_manifold = unstable_plus.clone();
    unstable_manifold.extend(unstable_minus.iter().cloned());

    let mut stable_manifold = stable_plus.clone();
    stable_manifold.extend(stable_minus.iter().cloned());

    let result =
        compute_hausdorff_distance(&unstable_manifold, &stable_manifold, num_closest_pairs)
            .map_err(|e| JsValue::from_str(&e))?;

    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    result
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

#[wasm_bindgen]
pub fn compute_bifurcation_hausdorff(
    b: f64,
    epsilon: f64,
    a_min: f64,
    a_max: f64,
    num_samples: usize,
) -> Result<JsValue, JsValue> {
    console_log!(
        "Computing bifurcation Hausdorff for a ∈ [{}, {}] with {} samples",
        a_min,
        a_max,
        num_samples
    );

    if num_samples == 0 {
        return Err(JsValue::from_str("num_samples must be positive"));
    }

    let delta_a = (a_max - a_min) / (num_samples as f64 - 1.0);

    #[derive(Serialize)]
    struct BifurcationPoint {
        a: f64,
        hausdorff_distance: f64,
        max_unstable_to_stable: f64,
        max_stable_to_unstable: f64,
        has_intersection: bool,
        intersection_threshold: f64,
    }

    let mut result: Vec<BifurcationPoint> = Vec::new();
    let intersection_threshold = epsilon * 2.0;

    for i in 0..num_samples {
        let a = a_min + i as f64 * delta_a;
        console_log!("Computing for a = {:.4}", a);

        let params = match HenonParams::new(a, b, epsilon) {
            Ok(p) => p,
            Err(e) => {
                console_log!("Invalid parameters at a={}: {}", a, e);
                continue;
            }
        };

        let discriminant = (1.0 - b) * (1.0 - b) + 4.0 * a;
        if discriminant < 0.0 {
            console_log!("No real fixed points for a={}", a);
            continue;
        }

        let sqrt_disc = discriminant.sqrt();
        let x1 = (-(1.0 - b) + sqrt_disc) / (2.0 * a);
        let y1 = b * x1;

        let jac = params.jacobian(Vector2::new(x1, y1));
        let trace = jac.trace();
        let det = jac.determinant();
        let eig_disc = trace * trace - 4.0 * det;

        if eig_disc < 0.0 {
            console_log!("Complex eigenvalues for a={}, skipping", a);
            continue;
        }

        let sqrt_eig = eig_disc.sqrt();
        let l1 = (trace + sqrt_eig) / 2.0;
        let l2 = (trace - sqrt_eig) / 2.0;

        if !((l1.abs() < 1.0 && l2.abs() > 1.0) || (l1.abs() > 1.0 && l2.abs() < 1.0)) {
            console_log!("Not a saddle for a={}, skipping", a);
            continue;
        }

        let unstable_lambda = if l1.abs() > l2.abs() { l1 } else { l2 };
        let stable_lambda = if l1.abs() < l2.abs() { l1 } else { l2 };

        let compute_eigenvector = |lambda: f64| -> Vector2<f64> {
            let v1 = 1.0;
            let v2 = 2.0 * a * x1 + lambda;
            let norm = (v1 * v1 + v2 * v2).sqrt();
            Vector2::new(v1 / norm, v2 / norm)
        };

        let unstable_eigenvec = compute_eigenvector(unstable_lambda);
        let stable_eigenvec = compute_eigenvector(stable_lambda);

        let config = ManifoldConfig {
            max_iter: 1000,
            max_points: 50000,
            time_limit: 2.0,
            ..ManifoldConfig::default()
        };

        let saddle_unstable = SaddlePoint::from_2d_eigenvector(
            Vector2::new(x1, y1),
            unstable_eigenvec,
            1,
            unstable_lambda,
            SaddleType::Regular,
            None,
        );

        let computer = UnstableManifoldComputer::new(params, config.clone());

        let unstable_manifold = match computer.compute_manifold(&saddle_unstable, &[]) {
            Ok((plus, minus)) => {
                let mut pts = trajectory_to_points(&plus);
                pts.extend(trajectory_to_points(&minus));
                pts
            }
            Err(e) => {
                console_log!("Failed to compute unstable manifold: {}", e);
                continue;
            }
        };

        let saddle_stable = SaddlePoint::from_2d_eigenvector(
            Vector2::new(x1, y1),
            stable_eigenvec,
            1,
            stable_lambda,
            SaddleType::DualRepeller, // Use DualRepeller to force inverse map
            None,
        );

        let stable_manifold = match computer.compute_manifold(&saddle_stable, &[]) {
            Ok((plus, minus)) => {
                let mut pts = trajectory_to_points(&plus);
                pts.extend(trajectory_to_points(&minus));
                pts
            }
            Err(e) => {
                console_log!("Failed to compute stable manifold: {}", e);
                continue;
            }
        };

        console_log!(
            "a={:.4}: U={} pts, S={} pts",
            a,
            unstable_manifold.len(),
            stable_manifold.len()
        );

        if unstable_manifold.is_empty() || stable_manifold.is_empty() {
            console_log!("Empty manifold for a={}, skipping", a);
            continue;
        }

        match compute_hausdorff_distance(&unstable_manifold, &stable_manifold, 10) {
            Ok(hausdorff) => {
                let has_intersection = hausdorff.distance < intersection_threshold;

                console_log!(
                    "a={:.4}: d_H={:.6}, intersection={}",
                    a,
                    hausdorff.distance,
                    has_intersection
                );

                result.push(BifurcationPoint {
                    a,
                    hausdorff_distance: hausdorff.distance,
                    max_unstable_to_stable: hausdorff.max_from_a,
                    max_stable_to_unstable: hausdorff.max_from_b,
                    has_intersection,
                    intersection_threshold,
                });
            }
            Err(e) => {
                console_log!("Hausdorff computation failed for a={}: {}", a, e);
            }
        }
    }

    console_log!(
        "Bifurcation analysis complete. {} valid samples",
        result.len()
    );

    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    result
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}
