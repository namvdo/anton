//! Hénon analysis facade, trajectory tracking, and WebAssembly adapter.

use super::*;

/// WASM-exposed boundary map for Hénon, routing through the generic pipeline.
#[wasm_bindgen(js_name = "boundary_map")]
pub fn boundary_map_henon(
    x: f64,
    y: f64,
    nx: f64,
    ny: f64,
    a: f64,
    b: f64,
    ep: f64,
) -> ExtendedPoint {
    let system = HenonSystem::new(a, b, ep);
    boundary_map_generic(&system, x, y, nx, ny)
}

pub struct BoundaryHenonSystemAnalysis {
    pub a: f64,
    pub b: f64,
    pub epsilon: f64,
    pub orbit_database: PeriodicOrbitDatabase,
    pub trajectory: Vec<TrajectoryPoint>,
}

impl BoundaryHenonSystemAnalysis {
    pub fn from_config(
        a: f64,
        b: f64,
        epsilon: f64,
        bounds: PhaseSpaceBounds,
        search: PeriodicSearchConfig,
    ) -> Result<Self, String> {
        if !a.is_finite() || !b.is_finite() {
            return Err("Hénon parameters a and b must be finite".to_string());
        }
        if !epsilon.is_finite() || epsilon < 0.0 {
            return Err("Noise radius epsilon must be finite and non-negative".to_string());
        }

        let system = HenonSystem::new(a, b, epsilon);
        let orbit_database = find_all_boundary_periodic_orbits_generic_with_threshold(
            &system,
            search.max_period,
            search.grid_size,
            search.theta_grid_size,
            bounds.x_min,
            bounds.x_max,
            bounds.y_min,
            bounds.y_max,
            search.residual_threshold,
        );
        log_message(&format!(
            "Total orbits found (boundary map): {}",
            orbit_database.total_count()
        ));

        Ok(Self {
            a,
            b,
            epsilon,
            orbit_database,
            trajectory: Vec::new(),
        })
    }

    pub fn new(
        a: f64,
        b: f64,
        epsilon: f64,
        max_period: usize,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    ) -> Self {
        Self::new_with_search_settings(
            a,
            b,
            epsilon,
            max_period,
            x_min,
            x_max,
            y_min,
            y_max,
            DEFAULT_PERIODIC_GRID_SIZE,
            DEFAULT_THETA_GRID_SIZE,
            DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
        )
    }

    pub fn new_with_search_settings(
        a: f64,
        b: f64,
        epsilon: f64,
        max_period: usize,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
        grid_size: usize,
        theta_grid_size: usize,
        residual_threshold: f64,
    ) -> Self {
        let grid_size = sanitize_grid_size(grid_size, DEFAULT_PERIODIC_GRID_SIZE);
        let theta_grid_size = sanitize_grid_size(theta_grid_size, DEFAULT_THETA_GRID_SIZE);
        let residual_threshold = sanitize_residual_threshold(residual_threshold);

        let system = HenonSystem::new(a, b, epsilon);
        let orbit_database = find_all_boundary_periodic_orbits_generic_with_threshold(
            &system,
            max_period,
            grid_size,
            theta_grid_size,
            x_min,
            x_max,
            y_min,
            y_max,
            residual_threshold,
        );
        log_message(&format!(
            "Total orbits found (boundary map): {}",
            orbit_database.total_count()
        ));

        Self {
            a,
            b,
            epsilon,
            orbit_database,
            trajectory: Vec::new(),
        }
    }

    pub fn track_trajectory(
        &mut self,
        initial_x: f64,
        initial_y: f64,
        initial_nx: f64,
        initial_ny: f64,
        max_iterations: usize,
    ) {
        self.trajectory.clear();

        let mut x = initial_x;
        let mut y = initial_y;
        let mut nx = initial_nx;
        let mut ny = initial_ny;

        // normalize initial normal
        let norm = (nx * nx + ny * ny).sqrt();
        if norm > 1e-12 {
            nx /= norm;
            ny /= norm;
        }

        let classification = self.orbit_database.classify_point(x, y, 0.005);
        self.trajectory.push(TrajectoryPoint {
            x,
            y,
            nx,
            ny,
            classification,
        });

        let system = HenonSystem::new(self.a, self.b, self.epsilon);
        for iter in 1..=max_iterations {
            let next_point = boundary_map_generic(&system, x, y, nx, ny);

            if !next_point.is_finite() || !next_point.is_bounded(100.0) {
                log_message(&format!("Point diverged at iteration {}", iter));
                break;
            }
            let classification =
                self.orbit_database
                    .classify_point(next_point.x, next_point.y, 1e-4);
            self.trajectory.push(TrajectoryPoint {
                x: next_point.x,
                y: next_point.y,
                nx: next_point.nx,
                ny: next_point.ny,
                classification,
            });

            x = next_point.x;
            y = next_point.y;
            nx = next_point.nx;
            ny = next_point.ny;
        }

        log_message(&format!(
            "Trajectory complete. Total points: {}",
            self.trajectory.len()
        ));
    }
}

#[derive(Serialize, Deserialize)]
pub struct TrajectoryPointJS {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
    pub classification: String,
    pub period: Option<usize>,
    pub stability: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct PeriodicOrbitJS {
    pub points: Vec<(f64, f64)>,
    pub extended_points: Vec<(f64, f64, f64, f64)>,
    pub period: usize,
    pub stability: String,
    pub eigenvalues: Vec<f64>,
    pub residual: Option<f64>,
    pub maximum_normal_length_error: f64,
    pub multiplier_relation_residual: Option<f64>,
}

pub(super) fn periodic_orbit_js(
    system: &dyn DynamicalSystem,
    orbit: &PeriodicOrbit,
) -> PeriodicOrbitJS {
    let first = orbit.extended_points.first().copied();
    let residual = first.and_then(|point| {
        let state = ExtendedState {
            pos: Vector2::new(point.x, point.y),
            normal: Vector2::new(point.nx, point.ny),
        };
        system.extended_map(state, orbit.period).ok().map(|image| {
            ((image.pos.x - point.x).powi(2)
                + (image.pos.y - point.y).powi(2)
                + (image.normal.x - point.nx).powi(2)
                + (image.normal.y - point.ny).powi(2))
            .sqrt()
        })
    });
    let maximum_normal_length_error = orbit
        .extended_points
        .iter()
        .map(|point| (point.nx.hypot(point.ny) - 1.0).abs())
        .fold(0.0, f64::max);
    let multiplier_relation = first.and_then(|point| {
        reduced_periodic_diagnostics(system, point, orbit.period)
            .ok()
            .map(|diagnostics| diagnostics.multiplier_relation_residual)
    });

    PeriodicOrbitJS {
        points: orbit
            .points
            .iter()
            .map(|point| (point.x, point.y))
            .collect(),
        extended_points: orbit
            .extended_points
            .iter()
            .map(|point| (point.x, point.y, point.nx, point.ny))
            .collect(),
        period: orbit.period,
        stability: String::from(&orbit.stability),
        eigenvalues: orbit.eigenvalues.clone(),
        residual,
        maximum_normal_length_error,
        multiplier_relation_residual: multiplier_relation,
    }
}

impl From<&StabilityType> for String {
    fn from(stability: &StabilityType) -> Self {
        match stability {
            StabilityType::Stable => "stable".to_string(),
            StabilityType::Unstable => "unstable".to_string(),
            StabilityType::Saddle => "saddle".to_string(),
        }
    }
}

impl From<&TrajectoryPoint> for TrajectoryPointJS {
    fn from(point: &TrajectoryPoint) -> Self {
        match &point.classification {
            PointClassification::Regular => TrajectoryPointJS {
                x: point.x,
                y: point.y,
                nx: point.nx,
                ny: point.ny,
                classification: "regular".to_string(),
                period: None,
                stability: None,
            },
            PointClassification::NearPeriodicOrbit {
                period,
                stability,
                distance: _,
            } => TrajectoryPointJS {
                x: point.x,
                y: point.y,
                nx: point.nx,
                ny: point.ny,
                classification: "periodic".to_string(),
                period: Some(*period),
                stability: Some(String::from(stability)),
            },
        }
    }
}

#[wasm_bindgen]
pub struct BoundaryHenonSystemWasm {
    system: BoundaryHenonSystemAnalysis,
    current_iteration: usize,
}

#[wasm_bindgen]
impl BoundaryHenonSystemWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(
        a: f64,
        b: f64,
        epsilon: f64,
        max_period: usize,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
        grid_size: Option<usize>,
        theta_grid_size: Option<usize>,
        residual_threshold: Option<f64>,
    ) -> Result<BoundaryHenonSystemWasm, JsValue> {
        console_error_panic_hook::set_once();

        let bounds = PhaseSpaceBounds::try_new(x_min, x_max, y_min, y_max)
            .map_err(|error| JsValue::from_str(&error))?;
        let search = PeriodicSearchConfig::try_new(
            max_period,
            grid_size.unwrap_or(DEFAULT_PERIODIC_GRID_SIZE),
            theta_grid_size.unwrap_or(DEFAULT_THETA_GRID_SIZE),
            residual_threshold.unwrap_or(DEFAULT_PERIODIC_RESIDUAL_THRESHOLD),
        )
        .map_err(|error| JsValue::from_str(&error))?;
        let system = BoundaryHenonSystemAnalysis::from_config(a, b, epsilon, bounds, search)
            .map_err(|error| JsValue::from_str(&error))?;
        Ok(Self {
            system,
            current_iteration: 0,
        })
    }

    #[wasm_bindgen(js_name = getPeriodicOrbits)]
    pub fn get_periodic_orbits(&self) -> Result<JsValue, JsValue> {
        let system = HenonSystem::new(self.system.a, self.system.b, self.system.epsilon);
        let orbits: Vec<PeriodicOrbitJS> = self
            .system
            .orbit_database
            .orbits
            .iter()
            .map(|orbit| periodic_orbit_js(&system, orbit))
            .collect();
        serde_wasm_bindgen::to_value(&orbits)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }
    #[wasm_bindgen(js_name = "trackTrajectory")]
    pub fn track_trajectory(
        &mut self,
        initial_x: f64,
        initial_y: f64,
        initial_nx: f64,
        initial_ny: f64,
        max_iterations: usize,
    ) {
        self.system
            .track_trajectory(initial_x, initial_y, initial_nx, initial_ny, max_iterations);
        self.current_iteration = 0;
    }

    #[wasm_bindgen(js_name = "getCurrentPoint")]
    pub fn get_current_point(&self) -> Result<JsValue, JsValue> {
        if self.current_iteration < self.system.trajectory.len() {
            let point = &self.system.trajectory[self.current_iteration];
            let point_js = TrajectoryPointJS::from(point);

            serde_wasm_bindgen::to_value(&point_js)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
        } else {
            Ok(JsValue::NULL)
        }
    }

    #[wasm_bindgen(js_name = "getTrajectory")]
    pub fn get_trajectory(&self, start: usize, end: usize) -> Result<JsValue, JsValue> {
        let end = end.min(self.system.trajectory.len());
        let points: Vec<TrajectoryPointJS> = self.system.trajectory[start..end]
            .iter()
            .map(TrajectoryPointJS::from)
            .collect();

        serde_wasm_bindgen::to_value(&points)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen()]
    pub fn step(&mut self) -> bool {
        if self.current_iteration + 1 < self.system.trajectory.len() {
            self.current_iteration += 1;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.current_iteration = 0;
    }

    #[wasm_bindgen(js_name = "getTotalIterations")]
    pub fn get_total_iterations(&self) -> usize {
        self.system.trajectory.len()
    }

    #[wasm_bindgen(js_name = "getCurrentIteration")]
    pub fn get_current_iteration(&self) -> usize {
        self.current_iteration
    }

    #[wasm_bindgen(js_name = "getOrbitCount")]
    pub fn get_orbit_count(&self) -> usize {
        self.system.orbit_database.total_count()
    }

    #[wasm_bindgen(js_name = "getEpsilon")]
    pub fn get_epsilon(&self) -> f64 {
        self.system.epsilon
    }
}
