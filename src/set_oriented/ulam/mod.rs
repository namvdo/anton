use crate::range::{clamp_pair, RANGE_LIMIT};
use crate::set_oriented::geometry::{box_intersects_noise_set, NoiseGeometry};
use crate::unstable_manifold::HenonParams;
use nalgebra::Vector2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

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

/// A hyperrectangular box in 2D space
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct HyperRect {
    pub center: (f64, f64),
    pub radius: (f64, f64),
}

impl HyperRect {
    /// Check if this box intersects with an epsilon-ball centered at a point
    pub fn intersects_ball(&self, point: (f64, f64), epsilon: f64) -> bool {
        self.intersects_noise_set(point, epsilon, NoiseGeometry::Euclidean)
            .unwrap_or(false)
    }

    pub fn intersects_noise_set(
        &self,
        point: (f64, f64),
        epsilon: f64,
        geometry: NoiseGeometry,
    ) -> Result<bool, String> {
        box_intersects_noise_set(self.center, self.radius, point, epsilon, geometry)
    }

    /// Check if a point is inside this box
    pub fn contains(&self, point: (f64, f64)) -> bool {
        (point.0 - self.center.0).abs() <= self.radius.0
            && (point.1 - self.center.1).abs() <= self.radius.1
    }
}

/// Grid structure for the Ulam method
#[derive(Clone)]
pub struct Grid {
    pub boxes: Vec<HyperRect>,
    pub domain_min: Vector2<f64>,
    pub domain_max: Vector2<f64>,
    pub step: Vector2<f64>,
    pub dims: (usize, usize),
}

impl Grid {
    pub fn new(min: Vector2<f64>, max: Vector2<f64>, subdivisions: usize) -> Self {
        Self::new_rectangular(min, max, (subdivisions, subdivisions))
    }

    pub fn new_rectangular(min: Vector2<f64>, max: Vector2<f64>, dims: (usize, usize)) -> Self {
        assert!(dims.0 > 0 && dims.1 > 0, "grid dimensions must be positive");
        let step = Vector2::new(
            (max.x - min.x) / dims.0 as f64,
            (max.y - min.y) / dims.1 as f64,
        );
        let mut boxes = Vec::with_capacity(dims.0 * dims.1);

        for j in 0..dims.1 {
            for i in 0..dims.0 {
                let center = Vector2::new(
                    min.x + step.x * (i as f64 + 0.5),
                    min.y + step.y * (j as f64 + 0.5),
                );

                boxes.push(HyperRect {
                    center: (center.x, center.y),
                    radius: (step.x / 2.0, step.y / 2.0),
                })
            }
        }

        Grid {
            boxes,
            domain_min: min,
            domain_max: max,
            step,
            dims,
        }
    }

    /// Find the box index containing a point
    pub fn search(&self, point: &Vector2<f64>) -> Option<usize> {
        let rel = point - self.domain_min;

        if rel.x < 0.0 || rel.y < 0.0 {
            return None;
        }

        let ix = (rel.x / self.step.x).floor() as usize;
        let iy = (rel.y / self.step.y).floor() as usize;

        if ix >= self.dims.0 || iy >= self.dims.1 {
            return None;
        }
        Some(iy * self.dims.0 + ix)
    }

    /// Find all boxes that intersect with an epsilon-ball centered at a point
    /// This implements the GAIO-style epsilon inflation
    pub fn find_intersecting_boxes(&self, point: &Vector2<f64>, epsilon: f64) -> Vec<usize> {
        self.find_intersecting_boxes_with_geometry(point, epsilon, NoiseGeometry::Euclidean)
    }

    pub fn find_intersecting_boxes_with_geometry(
        &self,
        point: &Vector2<f64>,
        epsilon: f64,
        geometry: NoiseGeometry,
    ) -> Vec<usize> {
        let mut result = Vec::new();

        // Calculate the bounding box of potential intersections
        let search_min_x = point.x - epsilon;
        let search_max_x = point.x + epsilon;
        let search_min_y = point.y - epsilon;
        let search_max_y = point.y + epsilon;

        // Convert to grid indices (with bounds checking)
        let rel_min = Vector2::new(search_min_x, search_min_y) - self.domain_min;
        let rel_max = Vector2::new(search_max_x, search_max_y) - self.domain_min;

        let ix_min = if rel_min.x < 0.0 {
            0
        } else {
            (rel_min.x / self.step.x).floor() as usize
        };
        let iy_min = if rel_min.y < 0.0 {
            0
        } else {
            (rel_min.y / self.step.y).floor() as usize
        };
        let ix_max = ((rel_max.x / self.step.x).ceil() as usize).min(self.dims.0);
        let iy_max = ((rel_max.y / self.step.y).ceil() as usize).min(self.dims.1);

        // Check each box in the potential range
        for iy in iy_min..iy_max {
            for ix in ix_min..ix_max {
                let idx = iy * self.dims.0 + ix;
                if idx < self.boxes.len() {
                    let box_ref = &self.boxes[idx];
                    if box_ref
                        .intersects_noise_set((point.x, point.y), epsilon, geometry)
                        .unwrap_or(false)
                    {
                        result.push(idx);
                    }
                }
            }
        }

        result
    }
}

/// UlamComputer computes the transition matrix and invariant measures
/// using the Ulam/GAIO method with epsilon-inflation
#[wasm_bindgen]
pub struct UlamComputer {
    grid: Grid,
    transitions: HashMap<usize, Vec<(usize, f64)>>,
    /// Left eigenvector of the row-stochastic matrix: `pi^T P = pi^T`.
    stationary_density: Vec<f64>,
    /// Right eigenvector initialized from the invariant-set support: `P alpha = alpha`.
    absorption_probabilities: Vec<f64>,
    epsilon: f64,
}

impl UlamComputer {
    fn build_henon(
        a: f64,
        b: f64,
        dims: (usize, usize),
        points_per_box: usize,
        epsilon: f64,
        min: Vector2<f64>,
        max: Vector2<f64>,
    ) -> Result<Self, String> {
        let params = HenonParams::new(a, b, epsilon)?;
        if dims.0 == 0 || dims.1 == 0 || dims.0.checked_mul(dims.1).is_none() {
            return Err("Ulam grid dimensions must be positive and finite in size".to_string());
        }
        if points_per_box == 0 {
            return Err("Ulam sampling requires at least one point per box".to_string());
        }
        if !min.x.is_finite()
            || !min.y.is_finite()
            || !max.x.is_finite()
            || !max.y.is_finite()
            || min.x >= max.x
            || min.y >= max.y
        {
            return Err("Ulam domain must have finite, strictly ordered bounds".to_string());
        }

        let grid = Grid::new_rectangular(min, max, dims);
        let n_boxes = grid.boxes.len();
        let samples_per_dim = (points_per_box as f64).sqrt().ceil() as usize;
        let actual_samples = samples_per_dim * samples_per_dim;
        console_log!(
            "Ulam: {}x{} boxes, {}x{} samples/box = {} samples, epsilon = {}",
            dims.0,
            dims.1,
            samples_per_dim,
            samples_per_dim,
            actual_samples,
            epsilon
        );

        let mut transitions: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();
        for (index, rect) in grid.boxes.iter().enumerate() {
            let center = Vector2::new(rect.center.0, rect.center.1);
            let radius = Vector2::new(rect.radius.0, rect.radius.1);
            let mut counts: HashMap<usize, usize> = HashMap::new();
            for sample_y in 0..samples_per_dim {
                for sample_x in 0..samples_per_dim {
                    let unit_x = if samples_per_dim > 1 {
                        -1.0 + 2.0 * sample_x as f64 / (samples_per_dim - 1) as f64
                    } else {
                        0.0
                    };
                    let unit_y = if samples_per_dim > 1 {
                        -1.0 + 2.0 * sample_y as f64 / (samples_per_dim - 1) as f64
                    } else {
                        0.0
                    };
                    let point =
                        Vector2::new(center.x + unit_x * radius.x, center.y + unit_y * radius.y);
                    let mapped = params.henon_map(&point)?;
                    for target in grid.find_intersecting_boxes(&mapped, epsilon) {
                        *counts.entry(target).or_insert(0) += 1;
                    }
                }
            }
            if !counts.is_empty() {
                let total = counts.values().sum::<usize>() as f64;
                let mut row: Vec<_> = counts
                    .into_iter()
                    .map(|(target, count)| (target, count as f64 / total))
                    .collect();
                row.sort_unstable_by_key(|(target, _)| *target);
                transitions.insert(index, row);
            }
        }

        let stationary_density = Self::compute_stationary_density(&transitions, n_boxes, 100);
        let support = Self::support_indicator(&stationary_density, 1e-10);
        let absorption_probabilities =
            Self::compute_absorption_probabilities(&transitions, &support, 1_000, 1e-12);
        console_log!(
            "Ulam computation complete. Stationary-density sum: {:.6}, absorption range: [{:.6}, {:.6}]",
            stationary_density.iter().sum::<f64>(),
            absorption_probabilities.iter().copied().fold(f64::INFINITY, f64::min),
            absorption_probabilities.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        );
        Ok(Self {
            grid,
            transitions,
            stationary_density,
            absorption_probabilities,
            epsilon,
        })
    }

    /// Build a native rectangular Ulam grid without silently changing its
    /// dimensions or domain. Refinement studies use this entry point so that
    /// the 2:1 thesis domain is covered by approximately square boxes.
    pub fn try_new_rectangular(
        a: f64,
        b: f64,
        dims: (usize, usize),
        points_per_box: usize,
        epsilon: f64,
        min: Vector2<f64>,
        max: Vector2<f64>,
    ) -> Result<Self, String> {
        Self::build_henon(a, b, dims, points_per_box, epsilon, min, max)
    }
}

#[wasm_bindgen]
impl UlamComputer {
    /// Create a new UlamComputer with the given parameters
    ///
    /// # Arguments
    /// * `a` - Henon map parameter a
    /// * `b` - Henon map parameter b
    /// * `subdivisions` - Number of grid subdivisions in each dimension
    /// * `points_per_box` - Number of sample points per box (will be squared for grid)
    /// * `epsilon` - Epsilon parameter for ball inflation (boundary detection)
    #[wasm_bindgen(constructor)]
    pub fn new(
        a: f64,
        b: f64,
        subdivisions: usize,
        points_per_box: usize,
        epsilon: f64,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    ) -> Result<UlamComputer, String> {
        let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
        let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
        Self::build_henon(
            a,
            b,
            (subdivisions, subdivisions),
            points_per_box,
            epsilon,
            Vector2::new(x_min, y_min),
            Vector2::new(x_max, y_max),
        )
    }

    /// Compute the stationary density (the left eigenvector of row-stochastic `P`).
    pub(crate) fn compute_stationary_density(
        transitions: &HashMap<usize, Vec<(usize, f64)>>,
        n_boxes: usize,
        iterations: usize,
    ) -> Vec<f64> {
        let mut measure = vec![1.0 / (n_boxes as f64); n_boxes];
        let mut next_measure = vec![0.0; n_boxes];

        for _ in 0..iterations {
            next_measure.fill(0.0);

            for (i, mass) in measure.iter().copied().enumerate().take(n_boxes) {
                if mass < 1e-15 {
                    continue;
                }

                if let Some(targets) = transitions.get(&i) {
                    for (tgt, prob) in targets {
                        if *tgt < n_boxes {
                            next_measure[*tgt] += mass * prob;
                        }
                    }
                }
            }

            let total_mass: f64 = next_measure.iter().sum();
            if total_mass > 1e-15 {
                let scale = 1.0 / total_mass;
                for x in next_measure.iter_mut() {
                    *x *= scale;
                }
                measure.copy_from_slice(&next_measure);
            } else {
                break;
            }
        }

        measure
    }

    fn support_indicator(stationary_density: &[f64], relative_threshold: f64) -> Vec<f64> {
        let maximum = stationary_density.iter().copied().fold(0.0, f64::max);
        let threshold = maximum * relative_threshold.max(f64::EPSILON);
        stationary_density
            .iter()
            .map(|&value| if value > threshold { 1.0 } else { 0.0 })
            .collect()
    }

    /// Compute absorption probabilities, the right eigenvector `P alpha = alpha`.
    ///
    /// The support indicator is essential: a uniform seed converges to an
    /// unrelated vector and erases the dependence on the chosen invariant set.
    pub(crate) fn compute_absorption_probabilities(
        transitions: &HashMap<usize, Vec<(usize, f64)>>,
        support: &[f64],
        max_iterations: usize,
        tolerance: f64,
    ) -> Vec<f64> {
        let n_boxes = support.len();
        let mut probabilities = support.to_vec();
        let mut next = vec![0.0; n_boxes];

        for _ in 0..max_iterations {
            next.fill(0.0);
            for (from, next_value) in next.iter_mut().enumerate() {
                if let Some(targets) = transitions.get(&from) {
                    *next_value = targets
                        .iter()
                        .filter(|(to, _)| *to < n_boxes)
                        .map(|(to, probability)| probability * probabilities[*to])
                        .sum::<f64>()
                        .clamp(0.0, 1.0);
                }
            }
            let residual = next
                .iter()
                .zip(&probabilities)
                .map(|(new, old)| (new - old).abs())
                .fold(0.0, f64::max);
            probabilities.copy_from_slice(&next);
            if residual <= tolerance {
                break;
            }
        }
        probabilities
    }

    /// Get the grid boxes as a serialized array
    pub fn get_grid_boxes(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.boxes).unwrap()
    }

    pub fn get_transitions(&self, from_box_idx: usize) -> JsValue {
        #[derive(Serialize)]
        struct Transition {
            index: usize,
            probability: f64,
        }

        if let Some(probs) = self.transitions.get(&from_box_idx) {
            let result: Vec<Transition> = probs
                .iter()
                .map(|(idx, p)| Transition {
                    index: *idx,
                    probability: *p,
                })
                .collect();
            serde_wasm_bindgen::to_value(&result).unwrap()
        } else {
            JsValue::NULL
        }
    }

    /// Stationary density, retained under the historical browser name.
    pub fn get_invariant_measure(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stationary_density).unwrap()
    }

    /// Absorption probabilities for the invariant set selected by the density support.
    pub fn get_absorption_probabilities(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.absorption_probabilities).unwrap()
    }

    /// Compatibility alias used by the v0.2 frontend.
    #[wasm_bindgen(js_name = "get_left_eigenvector")]
    pub fn get_left_eigenvector_compat(&self) -> JsValue {
        self.get_absorption_probabilities()
    }

    /// Get the epsilon parameter used for this computation
    pub fn get_epsilon(&self) -> f64 {
        self.epsilon
    }

    /// Get the grid step size (useful for UI scaling)
    pub fn get_grid_step(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&(self.grid.step.x, self.grid.step.y)).unwrap()
    }

    pub fn get_box_index(&self, x: f64, y: f64) -> isize {
        match self.grid.search(&Vector2::new(x, y)) {
            Some(idx) => idx as isize,
            None => -1,
        }
    }

    pub fn get_intersecting_boxes(&self, x: f64, y: f64) -> JsValue {
        let point = Vector2::new(x, y);
        let boxes = self.grid.find_intersecting_boxes(&point, self.epsilon);
        serde_wasm_bindgen::to_value(&boxes).unwrap()
    }

    pub fn get_dimensions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.dims).unwrap()
    }
}

impl UlamComputer {
    /// Native Rust view used by validation and reproducibility tooling. The
    /// browser API retains its serializing getters above.
    pub fn invariant_measure(&self) -> &[f64] {
        &self.stationary_density
    }

    pub fn absorption_probabilities(&self) -> &[f64] {
        &self.absorption_probabilities
    }

    #[deprecated(
        note = "use absorption_probabilities; this vector is not a backward invariant measure"
    )]
    pub fn backward_invariant_measure(&self) -> &[f64] {
        self.absorption_probabilities()
    }

    pub fn transition_probabilities(&self, from_box_idx: usize) -> &[(usize, f64)] {
        self.transitions
            .get(&from_box_idx)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn grid(&self) -> &Grid {
        &self.grid
    }
}

use crate::dynamical_systems::{DynamicalSystem, UserDefinedDynamicalSystem};
use crate::parameters::parameter_set_from_js;

#[wasm_bindgen]
pub struct UlamComputerUserDefined {
    grid: Grid,
    transitions: HashMap<usize, Vec<(usize, f64)>>,
    stationary_density: Vec<f64>,
    absorption_probabilities: Vec<f64>,
    epsilon: f64,
}

#[wasm_bindgen]
impl UlamComputerUserDefined {
    #[wasm_bindgen(constructor)]
    pub fn new(
        x_eq: &str,
        y_eq: &str,
        params: JsValue,
        subdivisions: usize,
        points_per_box: usize,
        epsilon: f64,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    ) -> Result<UlamComputerUserDefined, String> {
        let param_set = parameter_set_from_js(params).map_err(|e| e.to_string())?;
        let system = UserDefinedDynamicalSystem::new(x_eq, y_eq, 0.001, param_set)?;

        let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
        let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
        let min = Vector2::new(x_min, y_min);
        let max = Vector2::new(x_max, y_max);
        let grid = Grid::new(min, max, subdivisions);

        let n_boxes = grid.boxes.len();
        let samples_per_dim = (points_per_box as f64).sqrt().ceil() as usize;

        console_log!(
            "UlamUserDefined: {} boxes, {}x{} samples/box, epsilon = {}",
            n_boxes,
            samples_per_dim,
            samples_per_dim,
            epsilon
        );

        let mut transitions: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();

        for i in 0..n_boxes {
            let rect = &grid.boxes[i];
            let center = Vector2::new(rect.center.0, rect.center.1);
            let radius = Vector2::new(rect.radius.0, rect.radius.1);

            let mut counts: HashMap<usize, usize> = HashMap::new();
            let mut total_valid = 0usize;

            for sy in 0..samples_per_dim {
                for sx in 0..samples_per_dim {
                    let tx = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sx as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };
                    let ty = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sy as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };

                    let pt = Vector2::new(center.x + tx * radius.x, center.y + ty * radius.y);

                    if let Ok(mapped) = system.map(pt) {
                        let intersecting = grid.find_intersecting_boxes(&mapped, epsilon);
                        if !intersecting.is_empty() {
                            total_valid += 1;
                            for target_idx in intersecting {
                                *counts.entry(target_idx).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            if total_valid > 0 {
                let mut probs = Vec::with_capacity(counts.len());
                let total = counts.values().sum::<usize>() as f64;
                for (target, count) in counts {
                    probs.push((target, (count as f64) / total));
                }
                transitions.insert(i, probs);
            }
        }

        let stationary_density =
            UlamComputer::compute_stationary_density(&transitions, n_boxes, 100);
        let support = UlamComputer::support_indicator(&stationary_density, 1e-10);
        let absorption_probabilities =
            UlamComputer::compute_absorption_probabilities(&transitions, &support, 1_000, 1e-12);

        console_log!(
            "UlamUserDefined complete. Right EV sum: {:.6}, Left EV sum: {:.6}",
            stationary_density.iter().sum::<f64>(),
            absorption_probabilities.iter().sum::<f64>()
        );

        Ok(UlamComputerUserDefined {
            grid,
            transitions,
            stationary_density,
            absorption_probabilities,
            epsilon,
        })
    }

    pub fn get_grid_boxes(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.boxes).unwrap()
    }

    pub fn get_transitions(&self, from_box_idx: usize) -> JsValue {
        #[derive(Serialize)]
        struct Transition {
            index: usize,
            probability: f64,
        }

        if let Some(probs) = self.transitions.get(&from_box_idx) {
            let result: Vec<Transition> = probs
                .iter()
                .map(|(idx, p)| Transition {
                    index: *idx,
                    probability: *p,
                })
                .collect();
            serde_wasm_bindgen::to_value(&result).unwrap()
        } else {
            JsValue::NULL
        }
    }

    pub fn get_invariant_measure(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stationary_density).unwrap()
    }

    pub fn get_absorption_probabilities(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.absorption_probabilities).unwrap()
    }

    #[wasm_bindgen(js_name = "get_left_eigenvector")]
    pub fn get_left_eigenvector_compat(&self) -> JsValue {
        self.get_absorption_probabilities()
    }

    pub fn get_epsilon(&self) -> f64 {
        self.epsilon
    }

    pub fn get_grid_step(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&(self.grid.step.x, self.grid.step.y)).unwrap()
    }

    pub fn get_box_index(&self, x: f64, y: f64) -> isize {
        match self.grid.search(&Vector2::new(x, y)) {
            Some(idx) => idx as isize,
            None => -1,
        }
    }

    pub fn get_intersecting_boxes(&self, x: f64, y: f64) -> JsValue {
        let point = Vector2::new(x, y);
        let boxes = self.grid.find_intersecting_boxes(&point, self.epsilon);
        serde_wasm_bindgen::to_value(&boxes).unwrap()
    }

    pub fn get_dimensions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.dims).unwrap()
    }
}

use crate::continuous_ds::{DuffingODE, OdeSystem, UserDefinedOdeSystem};

#[wasm_bindgen]
pub struct UlamComputerContinuous {
    grid: Grid,
    transitions: HashMap<usize, Vec<(usize, f64)>>,
    stationary_density: Vec<f64>,
    absorption_probabilities: Vec<f64>,
    epsilon: f64,
}

#[wasm_bindgen]
impl UlamComputerContinuous {
    /// Build the Ulam matrix for the Duffing ODE  ẋ=y, ẏ=x−x³−δy
    /// using the time-T flow map as the generating discrete map.
    ///
    /// Arguments
    /// * `delta`        – damping δ
    /// * `capital_t`    – integration time T per discrete step
    /// * `subdivisions` – grid cells per axis
    /// * `points_per_box` – sample density
    /// * `epsilon`      – epsilon ball inflation for set-valued images
    #[wasm_bindgen(constructor)]
    pub fn new(
        delta: f64,
        capital_t: f64,
        subdivisions: usize,
        points_per_box: usize,
        epsilon: f64,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    ) -> Result<UlamComputerContinuous, String> {
        if !capital_t.is_finite() || capital_t <= 0.0 {
            return Err("integration time T must be finite and positive".to_string());
        }

        let ode = DuffingODE::new(delta)?;

        let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
        let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
        let min = Vector2::new(x_min, y_min);
        let max = Vector2::new(x_max, y_max);
        let grid = Grid::new(min, max, subdivisions);
        let n_boxes = grid.boxes.len();
        let samples_per_dim = (points_per_box as f64).sqrt().ceil() as usize;

        // choose sub-step h <= 0.01 so RK4 is accurate over [0, T]
        let n_substeps = ((capital_t / 0.01).ceil() as usize).max(1);
        let h = capital_t / (n_substeps as f64);

        console_log!(
            "UlamContinuous: {} boxes, {}×{} samples, T={:.4}, h={:.5}, ε={:.4}",
            n_boxes,
            samples_per_dim,
            samples_per_dim,
            capital_t,
            h,
            epsilon
        );

        let mut transitions: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();

        for i in 0..n_boxes {
            let rect = &grid.boxes[i];
            let center = Vector2::new(rect.center.0, rect.center.1);
            let radius = Vector2::new(rect.radius.0, rect.radius.1);
            let mut counts: HashMap<usize, usize> = HashMap::new();
            let mut total_valid = 0usize;

            for sy in 0..samples_per_dim {
                for sx in 0..samples_per_dim {
                    let tx = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sx as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };
                    let ty = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sy as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };

                    let mut pt = Vector2::new(center.x + tx * radius.x, center.y + ty * radius.y);

                    let mut ok = true;
                    for _ in 0..n_substeps {
                        match ode.rk4_step(pt, h) {
                            Ok(next) => {
                                pt = next;
                            }
                            Err(_) => {
                                ok = false;
                                break;
                            }
                        }
                    }

                    if ok && pt.x.is_finite() && pt.y.is_finite() {
                        let intersecting = grid.find_intersecting_boxes(&pt, epsilon);
                        if !intersecting.is_empty() {
                            total_valid += 1;
                            for t in intersecting {
                                *counts.entry(t).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            if total_valid > 0 {
                let total = counts.values().sum::<usize>() as f64;
                transitions.insert(
                    i,
                    counts
                        .into_iter()
                        .map(|(t, c)| (t, c as f64 / total))
                        .collect(),
                );
            }
        }

        let stationary_density =
            UlamComputer::compute_stationary_density(&transitions, n_boxes, 100);
        let support = UlamComputer::support_indicator(&stationary_density, 1e-10);
        let absorption_probabilities =
            UlamComputer::compute_absorption_probabilities(&transitions, &support, 1_000, 1e-12);

        console_log!(
            "UlamContinuous done. Right EV sum: {:.6}, Left EV sum: {:.6}",
            stationary_density.iter().sum::<f64>(),
            absorption_probabilities.iter().sum::<f64>()
        );

        Ok(UlamComputerContinuous {
            grid,
            transitions,
            stationary_density,
            absorption_probabilities,
            epsilon,
        })
    }

    pub fn get_grid_boxes(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.boxes).unwrap()
    }

    pub fn get_transitions(&self, from_box_idx: usize) -> JsValue {
        #[derive(Serialize)]
        struct Transition {
            index: usize,
            probability: f64,
        }

        if let Some(probs) = self.transitions.get(&from_box_idx) {
            let result: Vec<Transition> = probs
                .iter()
                .map(|(idx, p)| Transition {
                    index: *idx,
                    probability: *p,
                })
                .collect();
            serde_wasm_bindgen::to_value(&result).unwrap()
        } else {
            JsValue::NULL
        }
    }

    pub fn get_invariant_measure(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stationary_density).unwrap()
    }

    pub fn get_absorption_probabilities(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.absorption_probabilities).unwrap()
    }

    #[wasm_bindgen(js_name = "get_left_eigenvector")]
    pub fn get_left_eigenvector_compat(&self) -> JsValue {
        self.get_absorption_probabilities()
    }

    pub fn get_epsilon(&self) -> f64 {
        self.epsilon
    }

    pub fn get_grid_step(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&(self.grid.step.x, self.grid.step.y)).unwrap()
    }

    pub fn get_dimensions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.dims).unwrap()
    }

    pub fn get_box_index(&self, x: f64, y: f64) -> isize {
        match self.grid.search(&Vector2::new(x, y)) {
            Some(idx) => idx as isize,
            None => -1,
        }
    }
}

#[wasm_bindgen]
pub struct UlamComputerContinuousUserDefined {
    grid: Grid,
    transitions: HashMap<usize, Vec<(usize, f64)>>,
    stationary_density: Vec<f64>,
    absorption_probabilities: Vec<f64>,
    epsilon: f64,
}

#[wasm_bindgen]
impl UlamComputerContinuousUserDefined {
    /// Build the Ulam matrix for a user-defined ODE using the time-T flow map.
    ///
    /// Arguments
    /// * `x_eq`, `y_eq` – vector field components ẋ, ẏ
    /// * `params`      – parameter list (name/value)
    /// * `capital_t`   – integration time T per discrete step
    /// * `subdivisions` – grid cells per axis
    /// * `points_per_box` – sample density
    /// * `epsilon`     – epsilon ball inflation for set-valued images
    #[wasm_bindgen(constructor)]
    pub fn new(
        x_eq: &str,
        y_eq: &str,
        params: JsValue,
        capital_t: f64,
        subdivisions: usize,
        points_per_box: usize,
        epsilon: f64,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    ) -> Result<UlamComputerContinuousUserDefined, String> {
        if !capital_t.is_finite() || capital_t <= 0.0 {
            return Err("integration time T must be finite and positive".to_string());
        }

        let param_set = parameter_set_from_js(params).map_err(|e| e.to_string())?;
        let ode = UserDefinedOdeSystem::new(x_eq, y_eq, param_set)?;

        let (x_min, x_max) = clamp_pair(x_min, x_max, RANGE_LIMIT);
        let (y_min, y_max) = clamp_pair(y_min, y_max, RANGE_LIMIT);
        let min = Vector2::new(x_min, y_min);
        let max = Vector2::new(x_max, y_max);
        let grid = Grid::new(min, max, subdivisions);
        let n_boxes = grid.boxes.len();
        let samples_per_dim = (points_per_box as f64).sqrt().ceil() as usize;

        // choose sub-step h <= 0.01 so RK4 is accurate over [0, T]
        let n_substeps = ((capital_t / 0.01).ceil() as usize).max(1);
        let h = capital_t / (n_substeps as f64);

        console_log!(
            "UlamContinuousUserDefined: {} boxes, {}×{} samples, T={:.4}, h={:.5}, ε={:.4}",
            n_boxes,
            samples_per_dim,
            samples_per_dim,
            capital_t,
            h,
            epsilon
        );

        let mut transitions: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();

        for i in 0..n_boxes {
            let rect = &grid.boxes[i];
            let center = Vector2::new(rect.center.0, rect.center.1);
            let radius = Vector2::new(rect.radius.0, rect.radius.1);
            let mut counts: HashMap<usize, usize> = HashMap::new();
            let mut total_valid = 0usize;

            for sy in 0..samples_per_dim {
                for sx in 0..samples_per_dim {
                    let tx = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sx as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };
                    let ty = if samples_per_dim > 1 {
                        -1.0 + 2.0 * (sy as f64) / ((samples_per_dim - 1) as f64)
                    } else {
                        0.0
                    };

                    let mut pt = Vector2::new(center.x + tx * radius.x, center.y + ty * radius.y);

                    let mut ok = true;
                    for _ in 0..n_substeps {
                        match ode.rk4_step(pt, h) {
                            Ok(next) => {
                                pt = next;
                            }
                            Err(_) => {
                                ok = false;
                                break;
                            }
                        }
                    }

                    if ok && pt.x.is_finite() && pt.y.is_finite() {
                        let intersecting = grid.find_intersecting_boxes(&pt, epsilon);
                        if !intersecting.is_empty() {
                            total_valid += 1;
                            for t in intersecting {
                                *counts.entry(t).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            if total_valid > 0 {
                let total = counts.values().sum::<usize>() as f64;
                transitions.insert(
                    i,
                    counts
                        .into_iter()
                        .map(|(t, c)| (t, c as f64 / total))
                        .collect(),
                );
            }
        }

        let stationary_density =
            UlamComputer::compute_stationary_density(&transitions, n_boxes, 100);
        let support = UlamComputer::support_indicator(&stationary_density, 1e-10);
        let absorption_probabilities =
            UlamComputer::compute_absorption_probabilities(&transitions, &support, 1_000, 1e-12);

        console_log!(
            "UlamContinuousUserDefined done. Right EV sum: {:.6}, Left EV sum: {:.6}",
            stationary_density.iter().sum::<f64>(),
            absorption_probabilities.iter().sum::<f64>()
        );

        Ok(UlamComputerContinuousUserDefined {
            grid,
            transitions,
            stationary_density,
            absorption_probabilities,
            epsilon,
        })
    }

    pub fn get_grid_boxes(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.boxes).unwrap()
    }

    pub fn get_transitions(&self, from_box_idx: usize) -> JsValue {
        #[derive(Serialize)]
        struct Transition {
            index: usize,
            probability: f64,
        }

        if let Some(probs) = self.transitions.get(&from_box_idx) {
            let result: Vec<Transition> = probs
                .iter()
                .map(|(idx, p)| Transition {
                    index: *idx,
                    probability: *p,
                })
                .collect();
            serde_wasm_bindgen::to_value(&result).unwrap()
        } else {
            JsValue::NULL
        }
    }

    pub fn get_invariant_measure(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.stationary_density).unwrap()
    }

    pub fn get_absorption_probabilities(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.absorption_probabilities).unwrap()
    }

    #[wasm_bindgen(js_name = "get_left_eigenvector")]
    pub fn get_left_eigenvector_compat(&self) -> JsValue {
        self.get_absorption_probabilities()
    }

    pub fn get_epsilon(&self) -> f64 {
        self.epsilon
    }

    pub fn get_grid_step(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&(self.grid.step.x, self.grid.step.y)).unwrap()
    }

    pub fn get_dimensions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.grid.dims).unwrap()
    }

    pub fn get_box_index(&self, x: f64, y: f64) -> isize {
        match self.grid.search(&Vector2::new(x, y)) {
            Some(idx) => idx as isize,
            None => -1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangular_master_grid_has_8192_square_boxes() {
        let grid =
            Grid::new_rectangular(Vector2::new(-2.2, -1.1), Vector2::new(2.2, 1.1), (128, 64));
        assert_eq!(grid.boxes.len(), 8192);
        assert!((grid.step.x - grid.step.y).abs() < 1e-14);
        // The stated domain and 8192-box count imply this edge length. This is
        // intentionally tested because it differs from the thesis's 2^-5 text.
        assert!((grid.step.x - 0.034375).abs() < 1e-14);
    }

    #[test]
    fn absorption_power_iteration_uses_support_and_is_not_normalized() {
        let transitions = HashMap::from([
            (0, vec![(0, 1.0)]),
            (1, vec![(0, 0.5), (1, 0.5)]),
            (2, vec![(2, 1.0)]),
        ]);
        let alpha = UlamComputer::compute_absorption_probabilities(
            &transitions,
            &[1.0, 0.0, 0.0],
            1_000,
            1e-14,
        );
        assert!((alpha[0] - 1.0).abs() < 1e-14);
        assert!((alpha[1] - 1.0).abs() < 1e-12);
        assert_eq!(alpha[2], 0.0);
        assert!((alpha.iter().sum::<f64>() - 2.0).abs() < 1e-12);
    }
}
