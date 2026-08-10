use serde::{Deserialize, Serialize};
use std::f64;
use wasm_bindgen::prelude::*;
use web_sys::console;

#[wasm_bindgen]
#[derive(Debug, Clone, PartialEq, Copy)]
pub enum DuffingStabilityType {
    Stable,
    Unstable,
    Saddle,
}

pub type StabilityType = DuffingStabilityType;

impl From<&StabilityType> for String {
    fn from(stability: &StabilityType) -> Self {
        match stability {
            StabilityType::Stable => "stable".to_string(),
            StabilityType::Unstable => "unstable".to_string(),
            StabilityType::Saddle => "saddle".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Jacobian {
    pub j11: f64,
    pub j12: f64,
    pub j21: f64,
    pub j22: f64,
}

impl Jacobian {
    pub fn multiply(&self, other: &Jacobian) -> Jacobian {
        Jacobian {
            j11: self.j11 * other.j11 + self.j12 * other.j21,
            j12: self.j11 * other.j12 + self.j12 * other.j22,
            j21: self.j21 * other.j11 + self.j22 * other.j21,
            j22: self.j21 * other.j12 + self.j22 * other.j22,
        }
    }

    pub fn eigenvalues(&self) -> (f64, f64, bool) {
        let trace = self.j11 + self.j22;
        let det = self.j11 * self.j22 - self.j12 * self.j21;
        let discriminant = trace * trace - 4.0 * det;

        if discriminant >= 0.0 {
            let sqrt_disc = discriminant.sqrt();
            ((trace + sqrt_disc) / 2.0, (trace - sqrt_disc) / 2.0, false)
        } else {
            let modulus = det.sqrt();
            (modulus, modulus, true)
        }
    }

    pub fn inverse(&self) -> Option<Jacobian> {
        let det = self.j11 * self.j22 - self.j12 * self.j21;
        if det.abs() < 1e-15 {
            return None;
        }
        Some(Jacobian {
            j11: self.j22 / det,
            j12: -self.j12 / det,
            j21: -self.j21 / det,
            j22: self.j11 / det,
        })
    }
}

#[derive(Debug, Clone)]
pub struct PeriodicOrbit {
    pub points: Vec<Point>,
    pub period: usize,
    pub stability: StabilityType,
}

#[derive(Debug, Clone)]
pub enum PointClassification {
    Regular,
    NearPeriodicOrbit {
        period: usize,
        stability: StabilityType,
        distance: f64,
    },
}

#[derive(Debug, Clone)]
pub struct PeriodicOrbitDatabase {
    pub orbits: Vec<PeriodicOrbit>,
}

impl Default for PeriodicOrbitDatabase {
    fn default() -> Self {
        Self::new()
    }
}

impl PeriodicOrbitDatabase {
    pub fn new() -> Self {
        Self { orbits: Vec::new() }
    }

    pub fn add_orbit(&mut self, orbit: PeriodicOrbit) {
        self.orbits.push(orbit);
    }

    pub fn contains_point(&self, x: f64, y: f64, tol: f64) -> bool {
        self.orbits.iter().any(|orbit| {
            orbit
                .points
                .iter()
                .any(|p| (p.x - x).abs() < tol && (p.y - y).abs() < tol)
        })
    }

    pub fn get_points_of_period(&self, period: usize) -> Vec<Point> {
        self.orbits
            .iter()
            .filter(|orbit| orbit.period == period)
            .flat_map(|orbit| orbit.points.clone())
            .collect()
    }

    pub fn total_count(&self) -> usize {
        self.orbits.len()
    }

    pub fn classify_point(&self, x: f64, y: f64, threshold: f64) -> PointClassification {
        for orbit in &self.orbits {
            for point in &orbit.points {
                let distance = ((x - point.x).powi(2) + (y - point.y).powi(2)).sqrt();
                if distance < threshold {
                    return PointClassification::NearPeriodicOrbit {
                        period: orbit.period,
                        stability: orbit.stability,
                        distance,
                    };
                }
            }
        }
        PointClassification::Regular
    }
}

#[derive(Debug, Clone)]
pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub classification: PointClassification,
}

#[derive(Serialize, Deserialize)]
pub struct TrajectoryPointJS {
    pub x: f64,
    pub y: f64,
    pub classification: String,
    pub period: Option<usize>,
    pub stability: Option<String>,
}

impl From<&TrajectoryPoint> for TrajectoryPointJS {
    fn from(point: &TrajectoryPoint) -> Self {
        match &point.classification {
            PointClassification::Regular => TrajectoryPointJS {
                x: point.x,
                y: point.y,
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
                classification: "periodic".to_string(),
                period: Some(*period),
                stability: Some(String::from(stability)),
            },
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct PeriodicOrbitJS {
    pub points: Vec<(f64, f64)>,
    pub period: usize,
    pub stability: String,
    pub residual: Option<f64>,
}

/// Duffing map: x_{n+1} = y_n, y_{n+1} = -b * x_n + a*y_n - y_n^3
fn duffing_map(x: f64, y: f64, a: f64, b: f64) -> (f64, f64) {
    (y, -b * x + a * y - y * y * y)
}

fn periodic_orbit_residual(orbit: &PeriodicOrbit, a: f64, b: f64) -> Option<f64> {
    let first = orbit.points.first()?;
    let (mut x, mut y) = (first.x, first.y);
    for _ in 0..orbit.period {
        (x, y) = duffing_map(x, y, a, b);
    }
    let residual = (x - first.x).hypot(y - first.y);
    residual.is_finite().then_some(residual)
}

fn duffing_jacobian(_x: f64, y: f64, a: f64, b: f64) -> Jacobian {
    Jacobian {
        j11: 0.0,
        j12: 1.0,
        j21: -b,
        j22: a - 3.0 * y * y,
    }
}

fn classify_stability(jac: &Jacobian) -> StabilityType {
    let (lambda1, lambda2, is_complex) = jac.eigenvalues();

    if is_complex {
        if lambda1 < 1.0 {
            StabilityType::Stable
        } else {
            StabilityType::Unstable
        }
    } else {
        let abs_lambda1 = lambda1.abs();
        let abs_lambda2 = lambda2.abs();

        if abs_lambda1 < 1.0 && abs_lambda2 < 1.0 {
            StabilityType::Stable
        } else if abs_lambda1 > 1.0 && abs_lambda2 > 1.0 {
            StabilityType::Unstable
        } else {
            StabilityType::Saddle
        }
    }
}

fn compose_duffing_n_times(x0: f64, y0: f64, n: usize, a: f64, b: f64) -> ((f64, f64), Jacobian) {
    let mut x = x0;
    let mut y = y0;

    if n == 0 {
        return (
            (x0, y0),
            Jacobian {
                j11: 1.0,
                j12: 0.0,
                j21: 0.0,
                j22: 1.0,
            },
        );
    }

    let mut accumulated_jacobian = duffing_jacobian(x, y, a, b);
    (x, y) = duffing_map(x, y, a, b);

    for _ in 1..n {
        if !x.is_finite() || !y.is_finite() || x.abs() > 1e10 || y.abs() > 1e10 {
            return ((f64::NAN, f64::NAN), accumulated_jacobian);
        }

        let jac_current = duffing_jacobian(x, y, a, b);
        accumulated_jacobian = jac_current.multiply(&accumulated_jacobian);
        (x, y) = duffing_map(x, y, a, b);
    }

    ((x, y), accumulated_jacobian)
}

fn find_duffing_periodic_point_davidchack_lai(
    x0: f64,
    y0: f64,
    period: usize,
    a: f64,
    b: f64,
    beta: Option<f64>,
    max_iterations: usize,
    tolerance: f64,
) -> Option<Point> {
    let mut x = x0;
    let mut y = y0;

    let beta_val = beta.unwrap_or_else(|| 10.0 * 1.2_f64.powi(period as i32));

    for _ in 0..max_iterations {
        if !x.is_finite() || !y.is_finite() || x.abs() > 100.0 || y.abs() > 100.0 {
            return None;
        }

        let ((fx, fy), jac_fn) = compose_duffing_n_times(x, y, period, a, b);

        if !fx.is_finite() || !fy.is_finite() {
            return None;
        }

        let gx = fx - x;
        let gy = fy - y;

        let g_norm = (gx * gx + gy * gy).sqrt();

        if g_norm < 1e-10 {
            return Some(Point { x, y });
        }

        let jac_g = Jacobian {
            j11: jac_fn.j11 - 1.0,
            j12: jac_fn.j12,
            j21: jac_fn.j21,
            j22: jac_fn.j22 - 1.0,
        };

        let scaled_beta = beta_val * g_norm;

        let modified_jac = Jacobian {
            j11: scaled_beta - jac_g.j11,
            j12: -jac_g.j12,
            j21: -jac_g.j21,
            j22: scaled_beta - jac_g.j22,
        };

        let jac_inv = modified_jac.inverse()?;

        let dx = jac_inv.j11 * gx + jac_inv.j12 * gy;
        let dy = jac_inv.j21 * gx + jac_inv.j22 * gy;

        if !dx.is_finite() || !dy.is_finite() {
            return None;
        }

        x += dx;
        y += dy;

        if dx.abs() < tolerance && dy.abs() < tolerance {
            break;
        }
    }

    None
}

fn verify_duffing_minimal_period(point: &Point, claimed_period: usize, a: f64, b: f64) -> bool {
    for divisor in 1..claimed_period {
        if claimed_period % divisor == 0 {
            let ((fx, fy), _) = compose_duffing_n_times(point.x, point.y, divisor, a, b);
            if (fx - point.x).abs() < 1e-8 && (fy - point.y).abs() < 1e-8 {
                return false;
            }
        }
    }
    true
}

fn davidchack_lai_duffing(a: f64, b: f64, max_period: usize) -> PeriodicOrbitDatabase {
    let mut database = PeriodicOrbitDatabase::new();
    let seed_period = max_period.min(6);

    // Stage 1: Find orbits of period 1 to seed_period using grid search
    for period in 1..=seed_period.min(max_period) {
        let grid_size = if period == 1 { 30 } else { 40 };
        // Adjust search range based on Duffing dynamics
        let x_range = (-2.0, 2.0);
        let y_range = (-2.0, 2.0);

        for i in 0..grid_size {
            for j in 0..grid_size {
                let x0 = x_range.0 + (x_range.1 - x_range.0) * (i as f64) / (grid_size as f64);
                let y0 = y_range.0 + (y_range.1 - y_range.0) * (j as f64) / (grid_size as f64);

                if let Some(fixed_point) = find_duffing_periodic_point_davidchack_lai(
                    x0, y0, period, a, b, None, 100, 1e-10,
                ) {
                    if !database.contains_point(fixed_point.x, fixed_point.y, 0.01)
                        && verify_duffing_minimal_period(&fixed_point, period, a, b)
                    {
                        let mut orbit_points = vec![fixed_point];
                        let mut x = fixed_point.x;
                        let mut y = fixed_point.y;

                        for _ in 1..period {
                            let (x_new, y_new) = duffing_map(x, y, a, b);
                            orbit_points.push(Point { x: x_new, y: y_new });
                            x = x_new;
                            y = y_new;
                        }

                        let (_, jac_fn) =
                            compose_duffing_n_times(fixed_point.x, fixed_point.y, period, a, b);
                        let stability = classify_stability(&jac_fn);

                        database.add_orbit(PeriodicOrbit {
                            points: orbit_points,
                            period,
                            stability,
                        });
                    }
                }
            }
        }
    }

    // Stage 2: Use previously found periodic points as seeds for higher periods
    if max_period > seed_period {
        for period in (seed_period + 1)..=max_period {
            let mut seeds = Vec::new();

            for divisor in 1..period {
                if period % divisor == 0 {
                    seeds.extend(database.get_points_of_period(divisor));
                }
            }

            if period > 1 {
                seeds.extend(database.get_points_of_period(period - 1));
            }

            for seed in &seeds {
                let perturbation_size = 0.1;
                for dx in [-perturbation_size, 0.0, perturbation_size].iter() {
                    for dy in [-perturbation_size, 0.0, perturbation_size].iter() {
                        let x0 = seed.x + dx;
                        let y0 = seed.y + dy;

                        if let Some(periodic_point) = find_duffing_periodic_point_davidchack_lai(
                            x0, y0, period, a, b, None, 150, 1e-10,
                        ) {
                            if !database.contains_point(periodic_point.x, periodic_point.y, 0.01)
                                && verify_duffing_minimal_period(&periodic_point, period, a, b)
                            {
                                let mut orbit_points = vec![periodic_point];
                                let mut x = periodic_point.x;
                                let mut y = periodic_point.y;

                                for _ in 1..period {
                                    let (x_new, y_new) = duffing_map(x, y, a, b);
                                    orbit_points.push(Point { x: x_new, y: y_new });
                                    x = x_new;
                                    y = y_new;
                                }

                                let (_, jac_fn) = compose_duffing_n_times(
                                    periodic_point.x,
                                    periodic_point.y,
                                    period,
                                    a,
                                    b,
                                );
                                let stability = classify_stability(&jac_fn);

                                database.add_orbit(PeriodicOrbit {
                                    points: orbit_points,
                                    period,
                                    stability,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    database
}

pub struct DuffingSystemAnalysis {
    pub a: f64,
    pub b: f64,
    pub orbit_database: PeriodicOrbitDatabase,
    pub trajectory: Vec<TrajectoryPoint>,
}

impl DuffingSystemAnalysis {
    pub fn new(a: f64, b: f64, max_period: usize) -> Self {
        let orbit_database = davidchack_lai_duffing(a, b, max_period);
        console::log_1(
            &format!(
                "Duffing: Total orbits found using Davidchack & Lai: {}",
                orbit_database.total_count()
            )
            .into(),
        );

        Self {
            a,
            b,
            orbit_database,
            trajectory: Vec::new(),
        }
    }

    pub fn track_trajectory(&mut self, initial_x: f64, initial_y: f64, max_iterations: usize) {
        self.trajectory.clear();

        let mut x = initial_x;
        let mut y = initial_y;

        let classification = self.orbit_database.classify_point(x, y, 0.005);
        self.trajectory.push(TrajectoryPoint {
            x,
            y,
            classification,
        });

        for iter in 1..=max_iterations {
            let (x_new, y_new) = duffing_map(x, y, self.a, self.b);

            if !x_new.is_finite()
                || !y_new.is_finite()
                || x_new.abs() > 100.0
                || y_new.abs() > 100.0
            {
                console::log_1(&format!("Duffing point diverged at iteration {}", iter).into());
                break;
            }

            let classification = self.orbit_database.classify_point(x_new, y_new, 1e-4);

            self.trajectory.push(TrajectoryPoint {
                x: x_new,
                y: y_new,
                classification,
            });

            x = x_new;
            y = y_new;
        }

        console::log_1(
            &format!(
                "Duffing trajectory complete. Total points: {}",
                self.trajectory.len()
            )
            .into(),
        );
    }
}

#[wasm_bindgen]
pub struct DuffingSystemWasm {
    system: DuffingSystemAnalysis,
    current_iteration: usize,
}

#[wasm_bindgen]
impl DuffingSystemWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(a: f64, b: f64, max_period: usize) -> Result<DuffingSystemWasm, JsValue> {
        console_error_panic_hook::set_once();

        let system = DuffingSystemAnalysis::new(a, b, max_period);

        Ok(Self {
            system,
            current_iteration: 0,
        })
    }

    #[wasm_bindgen(js_name = getPeriodicOrbits)]
    pub fn get_periodic_orbits(&self) -> Result<JsValue, JsValue> {
        let orbits: Vec<PeriodicOrbitJS> = self
            .system
            .orbit_database
            .orbits
            .iter()
            .map(|orbit| PeriodicOrbitJS {
                points: orbit.points.iter().map(|p| (p.x, p.y)).collect(),
                period: orbit.period,
                stability: String::from(&orbit.stability),
                residual: periodic_orbit_residual(orbit, self.system.a, self.system.b),
            })
            .collect();

        serde_wasm_bindgen::to_value(&orbits)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen(js_name = trackTrajectory)]
    pub fn track_trajectory(&mut self, initial_x: f64, initial_y: f64, max_iterations: usize) {
        self.system
            .track_trajectory(initial_x, initial_y, max_iterations);
        self.current_iteration = 0;
    }

    #[wasm_bindgen(js_name = getCurrentPoint)]
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

    #[wasm_bindgen(js_name = getTrajectory)]
    pub fn get_trajectory(&self, start: usize, end: usize) -> Result<JsValue, JsValue> {
        let end = end.min(self.system.trajectory.len());
        let points: Vec<TrajectoryPointJS> = self.system.trajectory[start..end]
            .iter()
            .map(TrajectoryPointJS::from)
            .collect();

        serde_wasm_bindgen::to_value(&points)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen]
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

    #[wasm_bindgen(js_name = getTotalIterations)]
    pub fn get_total_iterations(&self) -> usize {
        self.system.trajectory.len()
    }

    #[wasm_bindgen(js_name = getCurrentIteration)]
    pub fn get_current_iteration(&self) -> usize {
        self.current_iteration
    }

    #[wasm_bindgen(js_name = getOrbitCount)]
    pub fn get_orbit_count(&self) -> usize {
        self.system.orbit_database.total_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn periodic_export_residual_is_computed_from_the_recorded_period() {
        let orbit = PeriodicOrbit {
            points: vec![Point { x: 0.0, y: 0.0 }],
            period: 1,
            stability: StabilityType::Saddle,
        };

        assert_eq!(periodic_orbit_residual(&orbit, 2.75, 0.2), Some(0.0));
    }
}
