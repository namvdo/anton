//! Parameter sweeps, Hénon branch reuse, and WebAssembly sweep adapters.

use super::*;

/// convert PeriodicOrbitDatabase to Vec<FoundPeriodicOrbit>.
pub fn database_to_found_orbits_generic(db: &PeriodicOrbitDatabase) -> Vec<FoundPeriodicOrbit> {
    db.orbits
        .iter()
        .map(|orbit| FoundPeriodicOrbit {
            points: orbit.points.iter().map(|p| (p.x, p.y)).collect(),
            extended_points: orbit
                .extended_points
                .iter()
                .map(|p| (p.x, p.y, p.nx, p.ny))
                .collect(),
            period: orbit.period,
            stability: String::from(&orbit.stability),
            eigenvalues: orbit.eigenvalues.clone(),
        })
        .collect()
}

pub fn parameter_sweep_henon_fast(
    base_params: &[(String, f64)],
    sweep_param_name: &str,
    sweep_min: f64,
    sweep_max: f64,
    num_samples: usize,
    epsilon: f64,
    max_period: usize,
    grid_size: usize,
    theta_grid_size: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> ParameterSweepResult {
    let mut results = Vec::with_capacity(num_samples);

    let get_param = |name: &str, override_name: &str, override_val: f64| -> f64 {
        if name == override_name {
            override_val
        } else {
            base_params
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, v)| *v)
                .unwrap_or(0.0)
        }
    };

    for i in 0..num_samples {
        let sweep_val = if num_samples <= 1 {
            sweep_min
        } else {
            sweep_min + (sweep_max - sweep_min) * (i as f64) / ((num_samples - 1) as f64)
        };

        log_message(&format!(
            "Sweep {}={:.4} ({}/{})",
            sweep_param_name,
            sweep_val,
            i + 1,
            num_samples
        ));

        let a = get_param("a", sweep_param_name, sweep_val);
        let b = get_param("b", sweep_param_name, sweep_val);
        let epsilon_at_sample = if sweep_param_name == "epsilon" {
            sweep_val
        } else {
            epsilon
        };

        let system = HenonSystem::new(a, b, epsilon_at_sample);
        let db = find_all_boundary_periodic_orbits_generic(
            &system,
            max_period,
            grid_size,
            theta_grid_size,
            x_min,
            x_max,
            y_min,
            y_max,
        );

        let orbits = database_to_found_orbits_generic(&db);
        let stable_count = orbits.iter().filter(|o| o.stability == "stable").count();
        let unstable_count = orbits.iter().filter(|o| o.stability == "unstable").count();
        let saddle_count = orbits.iter().filter(|o| o.stability == "saddle").count();

        results.push(SweepResult {
            param_value: sweep_val,
            total_orbits: orbits.len(),
            stable_count,
            unstable_count,
            saddle_count,
            orbits,
        });
    }

    ParameterSweepResult {
        param_name: sweep_param_name.to_string(),
        param_min: sweep_min,
        param_max: sweep_max,
        num_samples,
        b: base_params
            .iter()
            .find(|(n, _)| n == "b")
            .map(|(_, v)| *v)
            .unwrap_or(0.0),
        epsilon,
        max_period,
        results,
    }
}

/// run parameter sweep over a named parameter using the generic pipeline.
pub fn parameter_sweep_generic(
    x_eq: &str,
    y_eq: &str,
    base_params: &[(String, f64)],
    sweep_param_name: &str,
    sweep_min: f64,
    sweep_max: f64,
    num_samples: usize,
    epsilon: f64,
    max_period: usize,
    grid_size: usize,
    theta_grid_size: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> ParameterSweepResult {
    let mut results = Vec::with_capacity(num_samples);

    for i in 0..num_samples {
        let sweep_val = if num_samples <= 1 {
            sweep_min
        } else {
            sweep_min + (sweep_max - sweep_min) * (i as f64) / ((num_samples - 1) as f64)
        };

        log_message(&format!(
            "Sweep {}={:.4} ({}/{})",
            sweep_param_name,
            sweep_val,
            i + 1,
            num_samples
        ));

        // Build parameter set with the swept value
        let mut entries = Vec::new();
        for (name, value) in base_params {
            if name == sweep_param_name {
                entries.push(crate::parameters::ParameterEntry {
                    name: name.clone(),
                    value: sweep_val,
                });
            } else {
                entries.push(crate::parameters::ParameterEntry {
                    name: name.clone(),
                    value: *value,
                });
            }
        }

        let param_set = match crate::parameters::ParameterSet::new(entries) {
            Ok(ps) => ps,
            Err(e) => {
                log_message(&format!("Parameter error at sample {}: {}", i, e));
                continue;
            }
        };

        let system = match UserDefinedDynamicalSystem::new(x_eq, y_eq, epsilon, param_set) {
            Ok(s) => s,
            Err(e) => {
                log_message(&format!("System error at sample {}: {}", i, e));
                continue;
            }
        };

        let db = find_all_boundary_periodic_orbits_generic(
            &system,
            max_period,
            grid_size,
            theta_grid_size,
            x_min,
            x_max,
            y_min,
            y_max,
        );

        let orbits = database_to_found_orbits_generic(&db);
        let stable_count = orbits.iter().filter(|o| o.stability == "stable").count();
        let unstable_count = orbits.iter().filter(|o| o.stability == "unstable").count();
        let saddle_count = orbits.iter().filter(|o| o.stability == "saddle").count();

        results.push(SweepResult {
            param_value: sweep_val,
            total_orbits: orbits.len(),
            stable_count,
            unstable_count,
            saddle_count,
            orbits,
        });
    }

    ParameterSweepResult {
        param_name: sweep_param_name.to_string(),
        param_min: sweep_min,
        param_max: sweep_max,
        num_samples,
        b: base_params
            .iter()
            .find(|(n, _)| n == "b")
            .map(|(_, v)| *v)
            .unwrap_or(0.0),
        epsilon,
        max_period,
        results,
    }
}

pub fn filter_orbits_by_ulam_support(
    database: PeriodicOrbitDatabase,
    invariant_measure: &[f64],
    subdivisions: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    threshold: f64,
) -> PeriodicOrbitDatabase {
    if subdivisions == 0 || invariant_measure.is_empty() {
        return database;
    }

    let dx = (x_max - x_min) / (subdivisions as f64);
    let dy = (y_max - y_min) / (subdivisions as f64);
    if !dx.is_finite() || !dy.is_finite() || dx <= 0.0 || dy <= 0.0 {
        return database;
    }

    let on_support = |x: f64, y: f64| -> bool {
        if x < x_min || x > x_max || y < y_min || y > y_max {
            return false;
        }
        let mut ix = ((x - x_min) / dx).floor() as isize;
        let mut iy = ((y - y_min) / dy).floor() as isize;

        if ix == subdivisions as isize {
            ix -= 1;
        }
        if iy == subdivisions as isize {
            iy -= 1;
        }

        if ix < 0 || iy < 0 {
            return false;
        }

        let idx = (iy as usize) * subdivisions + (ix as usize);
        invariant_measure.get(idx).copied().unwrap_or(0.0) > threshold
    };

    let mut filtered = PeriodicOrbitDatabase::new();
    for orbit in database.orbits {
        if orbit
            .points
            .iter()
            .all(|point| on_support(point.x, point.y))
        {
            filtered.add_orbit(orbit);
        }
    }
    filtered
}

#[wasm_bindgen]
pub struct BoundaryUserDefinedSystemWasm {
    orbit_database: PeriodicOrbitDatabase,
    system: UserDefinedDynamicalSystem,
}

#[wasm_bindgen]
impl BoundaryUserDefinedSystemWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(
        x_eq: &str,
        y_eq: &str,
        params: JsValue,
        epsilon: f64,
        max_period: usize,
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
        grid_size: Option<usize>,
        theta_grid_size: Option<usize>,
        residual_threshold: Option<f64>,
    ) -> Result<BoundaryUserDefinedSystemWasm, JsValue> {
        console_error_panic_hook::set_once();

        let param_set = parameter_set_from_js(params).map_err(|e| JsValue::from_str(&e))?;
        let system = UserDefinedDynamicalSystem::new(x_eq, y_eq, epsilon, param_set)
            .map_err(|e| JsValue::from_str(&format!("Error parsing equations: {}", e)))?;

        let grid_size = sanitize_grid_size(
            grid_size.unwrap_or(DEFAULT_PERIODIC_GRID_SIZE),
            DEFAULT_PERIODIC_GRID_SIZE,
        );
        let theta_grid_size = sanitize_grid_size(
            theta_grid_size.unwrap_or(DEFAULT_THETA_GRID_SIZE),
            DEFAULT_THETA_GRID_SIZE,
        );
        let residual_threshold = sanitize_residual_threshold(
            residual_threshold.unwrap_or(DEFAULT_PERIODIC_RESIDUAL_THRESHOLD),
        );
        let orbit_database = davidchack_lai_boundary_map_generic(
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
            "Total orbits found (user-defined boundary map): {}",
            orbit_database.total_count()
        ));

        Ok(Self {
            orbit_database,
            system,
        })
    }

    #[wasm_bindgen(js_name = getPeriodicOrbits)]
    pub fn get_periodic_orbits(&self) -> Result<JsValue, JsValue> {
        let orbits: Vec<PeriodicOrbitJS> = self
            .orbit_database
            .orbits
            .iter()
            .map(|orbit| periodic_orbit_js(&self.system, orbit))
            .collect();
        serde_wasm_bindgen::to_value(&orbits)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen(js_name = "getOrbitCount")]
    pub fn get_orbit_count(&self) -> usize {
        self.orbit_database.total_count()
    }

    #[wasm_bindgen(js_name = "getEpsilon")]
    pub fn get_epsilon(&self) -> f64 {
        self.system.get_epsilon()
    }
}

#[wasm_bindgen]
pub fn boundary_map_user_defined(
    x: f64,
    y: f64,
    nx: f64,
    ny: f64,
    x_eq: &str,
    y_eq: &str,
    params: JsValue,
    epsilon: f64,
) -> Result<JsValue, JsValue> {
    use crate::dynamical_systems::{DynamicalSystem, ExtendedState, UserDefinedDynamicalSystem};
    use nalgebra::Vector2;

    let param_set = parameter_set_from_js(params).map_err(|e| JsValue::from_str(&e))?;
    let system = UserDefinedDynamicalSystem::new(x_eq, y_eq, epsilon, param_set)
        .map_err(|e| JsValue::from_str(&format!("Error parsing equations: {}", e)))?;

    let pos = Vector2::new(x, y);
    let normal = Vector2::new(nx, ny);
    let state = ExtendedState { pos, normal };

    let next_state = system
        .extended_map(state, 1)
        .map_err(|e| JsValue::from_str(&format!("Error evaluating extended map: {}", e)))?;

    let result = ExtendedPoint {
        x: next_state.pos.x,
        y: next_state.pos.y,
        nx: next_state.normal.x,
        ny: next_state.normal.y,
    };

    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    result.serialize(&serializer).map_err(|e| {
        web_sys::console::error_1(&JsValue::from_str(&format!("Serialization error: {:?}", e)));
        JsValue::from_str("Failed to serialize result")
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundPeriodicOrbit {
    pub points: Vec<(f64, f64)>,
    pub extended_points: Vec<(f64, f64, f64, f64)>,
    pub period: usize,
    pub stability: String,
    pub eigenvalues: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweepResult {
    pub param_value: f64,
    pub orbits: Vec<FoundPeriodicOrbit>,
    pub total_orbits: usize,
    pub stable_count: usize,
    pub unstable_count: usize,
    pub saddle_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterSweepResult {
    pub param_name: String,
    pub param_min: f64,
    pub param_max: f64,
    pub num_samples: usize,
    pub b: f64,
    pub epsilon: f64,
    pub max_period: usize,
    pub results: Vec<SweepResult>,
}

impl ParameterSweepResult {
    pub fn to_csv(&self) -> String {
        let mut csv = String::new();
        csv.push_str("parameter_a,period,stability,x,y,nx,ny\n");
        for result in &self.results {
            for orbit in &result.orbits {
                for &(x, y, nx, ny) in &orbit.extended_points {
                    csv.push_str(&format!(
                        "{},{},{},{},{},{},{}\n",
                        result.param_value, orbit.period, orbit.stability, x, y, nx, ny
                    ));
                }
            }
        }
        csv
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy)]
struct HenonContinuationParams {
    a: f64,
    b: f64,
    epsilon: f64,
}

fn found_orbit_seed(orbit: &FoundPeriodicOrbit) -> Option<ExtendedPoint> {
    orbit
        .extended_points
        .first()
        .map(|&(x, y, nx, ny)| ExtendedPoint::new(x, y, nx, ny))
        .filter(ExtendedPoint::is_finite)
}

fn correct_henon_seed_at_params(
    seed: ExtendedPoint,
    period: usize,
    params: HenonContinuationParams,
    residual_threshold: f64,
) -> Option<ExtendedPoint> {
    let system = HenonSystem::new(params.a, params.b, params.epsilon);
    find_boundary_periodic_point_davidchack_lai_generic(
        &system,
        seed.x,
        seed.y,
        seed.nx,
        seed.ny,
        period,
        None,
        80,
        1e-12,
        residual_threshold,
    )
}

fn continue_henon_seed_stepped(
    seed: ExtendedPoint,
    period: usize,
    old_params: HenonContinuationParams,
    new_params: HenonContinuationParams,
    residual_threshold: f64,
) -> Option<ExtendedPoint> {
    if let Some(fp) = correct_henon_seed_at_params(seed, period, new_params, residual_threshold) {
        return Some(fp);
    }

    let da = new_params.a - old_params.a;
    let db = new_params.b - old_params.b;
    let de = new_params.epsilon - old_params.epsilon;

    let dist = da.abs().max(db.abs()).max(de.abs());
    if dist < 1e-8 {
        return None;
    }

    let step_size = 0.002;
    let num_steps = ((dist / step_size).ceil() as usize).clamp(2, 100);

    let mut current_seed = seed;
    for step in 1..=num_steps {
        let t = step as f64 / num_steps as f64;
        let interim_params = HenonContinuationParams {
            a: old_params.a + t * da,
            b: old_params.b + t * db,
            epsilon: old_params.epsilon + t * de,
        };
        current_seed =
            correct_henon_seed_at_params(current_seed, period, interim_params, residual_threshold)?;
    }
    Some(current_seed)
}

/// Correct cached Hénon periodic orbits at the target parameters, stepping along
/// the parameter path if direct correction fails.
pub fn continue_henon_orbits_from_previous(
    previous_orbits: &[FoundPeriodicOrbit],
    old_a: f64,
    old_b: f64,
    old_epsilon: f64,
    new_a: f64,
    new_b: f64,
    new_epsilon: f64,
    max_period: usize,
    residual_threshold: f64,
) -> PeriodicOrbitDatabase {
    let residual_threshold = sanitize_residual_threshold(residual_threshold);
    let old_params = HenonContinuationParams {
        a: old_a,
        b: old_b,
        epsilon: old_epsilon,
    };
    let new_params = HenonContinuationParams {
        a: new_a,
        b: new_b,
        epsilon: new_epsilon,
    };
    let new_system = HenonSystem::new(new_a, new_b, new_epsilon);
    let mut database = PeriodicOrbitDatabase::new();

    for orbit in previous_orbits {
        if orbit.period == 0 || orbit.period > max_period {
            continue;
        }
        let Some(seed) = found_orbit_seed(orbit) else {
            continue;
        };

        let corrected = continue_henon_seed_stepped(
            seed,
            orbit.period,
            old_params,
            new_params,
            residual_threshold,
        );

        if let Some(fp) = corrected {
            try_add_orbit_generic(
                &new_system,
                &mut database,
                fp,
                orbit.period,
                residual_threshold,
            );
        }
    }

    database
}

// WASM

#[wasm_bindgen(js_name = "continueBoundaryHenonOrbits")]
pub fn continue_boundary_henon_orbits_wasm(
    previous_orbits_js: JsValue,
    old_a: f64,
    old_b: f64,
    old_epsilon: f64,
    new_a: f64,
    new_b: f64,
    new_epsilon: f64,
    max_period: usize,
    residual_threshold: f64,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let previous_orbits: Vec<FoundPeriodicOrbit> =
        serde_wasm_bindgen::from_value(previous_orbits_js)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse previous orbits: {}", e)))?;

    let db = continue_henon_orbits_from_previous(
        &previous_orbits,
        old_a,
        old_b,
        old_epsilon,
        new_a,
        new_b,
        new_epsilon,
        max_period,
        residual_threshold,
    );
    let orbits = database_to_found_orbits_generic(&db);
    serde_wasm_bindgen::to_value(&orbits)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = "parameterSweep")]
pub fn parameter_sweep_wasm(
    b: f64,
    epsilon: f64,
    a_min: f64,
    a_max: f64,
    num_samples: usize,
    max_period: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    let base_params = vec![
        ("a".to_string(), a_min), // placeholder, will be swept
        ("b".to_string(), b),
    ];
    let result = parameter_sweep_henon_fast(
        &base_params,
        "a",
        a_min,
        a_max,
        num_samples,
        epsilon,
        max_period,
        15,
        12,
        x_min,
        x_max,
        y_min,
        y_max,
    );
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Unified parameter sweep: works for any system type + any parameter.
#[wasm_bindgen(js_name = "parameterSweepGeneric")]
pub fn parameter_sweep_generic_wasm(
    system_type: &str,
    x_eq: &str,
    y_eq: &str,
    params_js: JsValue,
    sweep_param_name: &str,
    sweep_min: f64,
    sweep_max: f64,
    num_samples: usize,
    epsilon: f64,
    max_period: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let param_set =
        crate::parameters::parameter_set_from_js(params_js).map_err(|e| JsValue::from_str(&e))?;

    let base_params: Vec<(String, f64)> = param_set
        .entries()
        .iter()
        .map(|e| (e.name.clone(), e.value))
        .collect();

    let grid_size = 15;
    let theta_grid_size = 12;

    let result = if system_type == "henon" || system_type == "discrete_henon" {
        parameter_sweep_henon_fast(
            &base_params,
            sweep_param_name,
            sweep_min,
            sweep_max,
            num_samples,
            epsilon,
            max_period,
            grid_size,
            theta_grid_size,
            x_min,
            x_max,
            y_min,
            y_max,
        )
    } else {
        let (actual_x_eq, actual_y_eq) = match system_type {
            "duffing" | "discrete_duffing" => ("y", "-b * x + a * y - y^3"),
            _ => (x_eq, y_eq),
        };
        parameter_sweep_generic(
            actual_x_eq,
            actual_y_eq,
            &base_params,
            sweep_param_name,
            sweep_min,
            sweep_max,
            num_samples,
            epsilon,
            max_period,
            grid_size,
            theta_grid_size,
            x_min,
            x_max,
            y_min,
            y_max,
        )
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = "parameterSweepCsv")]
pub fn parameter_sweep_csv_wasm(
    b: f64,
    epsilon: f64,
    a_min: f64,
    a_max: f64,
    num_samples: usize,
    max_period: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
) -> String {
    console_error_panic_hook::set_once();
    let base_params = vec![("a".to_string(), a_min), ("b".to_string(), b)];
    let result = parameter_sweep_henon_fast(
        &base_params,
        "a",
        a_min,
        a_max,
        num_samples,
        epsilon,
        max_period,
        15,
        12,
        x_min,
        x_max,
        y_min,
        y_max,
    );
    result.to_csv()
}
