//! Shared periodic-orbit data types, Jacobians, and stability diagnostics.

use super::*;

#[wasm_bindgen]
#[derive(Debug, Clone, PartialEq, Copy)]
pub enum StabilityType {
    Stable,
    Unstable,
    Saddle,
}

pub(super) fn log_message(s: &str) {
    #[cfg(target_arch = "wasm32")]
    console::log_1(&s.into());
    #[cfg(not(target_arch = "wasm32"))]
    println!("{}", s);
}

pub const DEFAULT_PERIODIC_GRID_SIZE: usize = 10;
pub const DEFAULT_THETA_GRID_SIZE: usize = 10;
pub const DEFAULT_PERIODIC_RESIDUAL_THRESHOLD: f64 = 1e-10;
const MIN_PERIODIC_GRID_SIZE: usize = 2;
const MAX_PERIODIC_GRID_SIZE: usize = 256;

pub(super) fn sanitize_grid_size(value: usize, fallback: usize) -> usize {
    if value == 0 {
        return fallback;
    }
    value.clamp(MIN_PERIODIC_GRID_SIZE, MAX_PERIODIC_GRID_SIZE)
}

pub(super) fn sanitize_residual_threshold(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return DEFAULT_PERIODIC_RESIDUAL_THRESHOLD;
    }
    value.clamp(1e-14, 1e-2)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PeriodicSearchConfig {
    pub max_period: usize,
    pub grid_size: usize,
    pub theta_grid_size: usize,
    pub residual_threshold: f64,
}

impl PeriodicSearchConfig {
    pub fn try_new(
        max_period: usize,
        grid_size: usize,
        theta_grid_size: usize,
        residual_threshold: f64,
    ) -> Result<Self, String> {
        if max_period == 0 {
            return Err("Maximum period must be at least 1".to_string());
        }
        if !(MIN_PERIODIC_GRID_SIZE..=MAX_PERIODIC_GRID_SIZE).contains(&grid_size) {
            return Err(format!(
                "Grid size must be between {} and {}",
                MIN_PERIODIC_GRID_SIZE, MAX_PERIODIC_GRID_SIZE
            ));
        }
        if !(MIN_PERIODIC_GRID_SIZE..=MAX_PERIODIC_GRID_SIZE).contains(&theta_grid_size) {
            return Err(format!(
                "Normal-angle grid size must be between {} and {}",
                MIN_PERIODIC_GRID_SIZE, MAX_PERIODIC_GRID_SIZE
            ));
        }
        if !residual_threshold.is_finite() || residual_threshold <= 0.0 {
            return Err("Residual threshold must be a positive finite number".to_string());
        }
        Ok(Self {
            max_period,
            grid_size,
            theta_grid_size,
            residual_threshold,
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BoundaryPoint {
    pub x: f64,
    pub y: f64,
}

// Extended point in the boundary space (x,y,n_x,n_y)
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct ExtendedPoint {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
}

impl ExtendedPoint {
    pub fn new(x: f64, y: f64, n_x: f64, n_y: f64) -> Self {
        Self {
            x,
            y,
            nx: n_x,
            ny: n_y,
        }
    }

    pub fn from_angle(x: f64, y: f64, theta: f64) -> Self {
        Self {
            x,
            y,
            nx: theta.cos(),
            ny: theta.sin(),
        }
    }

    pub fn normalize(&mut self) {
        let norm = (self.nx * self.nx + self.ny * self.ny).sqrt();
        if norm > 1e-12 {
            self.nx /= norm;
            self.ny /= norm;
        }
    }

    pub fn is_finite(&self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.nx.is_finite() && self.ny.is_finite()
    }

    pub fn is_bounded(&self, max_val: f64) -> bool {
        self.x.abs() < max_val && self.y.abs() < max_val
    }
}

#[derive(Debug, Clone)]
pub struct PeriodicOrbit {
    pub points: Vec<BoundaryPoint>,
    pub extended_points: Vec<ExtendedPoint>,
    pub period: usize,
    pub stability: StabilityType,
    pub eigenvalues: Vec<f64>,
}

#[derive(Clone, Debug)]
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

    pub fn contains_extended_point(&self, p: &ExtendedPoint, tol: f64) -> bool {
        self.orbits.iter().any(|orbit| {
            orbit.extended_points.iter().any(|ep| {
                let dist = ((ep.x - p.x).powi(2)
                    + (ep.y - p.y).powi(2)
                    + (ep.nx - p.nx).powi(2)
                    + (ep.ny - p.ny).powi(2))
                .sqrt();
                dist < tol
            })
        })
    }

    /// Check if any existing orbit has a point spatially close (x,y only).
    /// This prevents the same physical orbit found with different normal vectors
    /// from being added twice.
    pub fn contains_spatial_point(&self, p: &ExtendedPoint, tol: f64) -> bool {
        self.orbits.iter().any(|orbit| {
            orbit.extended_points.iter().any(|ep| {
                let dist = ((ep.x - p.x).powi(2) + (ep.y - p.y).powi(2)).sqrt();
                dist < tol
            })
        })
    }

    fn find_matching_orbit(&self, x: f64, y: f64, tol: f64) -> Option<(usize, StabilityType, f64)> {
        for orbit in &self.orbits {
            for point in &orbit.points {
                let dist = ((point.x - x).powi(2) + (point.y - y).powi(2)).sqrt();
                if dist < tol {
                    return Some((orbit.period, orbit.stability, dist));
                }
            }
        }
        None
    }

    pub fn classify_point(&self, x: f64, y: f64, tol: f64) -> PointClassification {
        if let Some((period, stability, distance)) = self.find_matching_orbit(x, y, tol) {
            PointClassification::NearPeriodicOrbit {
                period,
                stability,
                distance,
            }
        } else {
            PointClassification::Regular
        }
    }

    pub fn total_count(&self) -> usize {
        self.orbits.len()
    }

    pub fn get_points_of_period(&self, period: usize) -> Vec<BoundaryPoint> {
        self.orbits
            .iter()
            .filter(|orbit| orbit.period == period)
            .flat_map(|o| o.points.clone())
            .collect()
    }

    pub fn get_extended_points_of_period(&self, period: usize) -> Vec<ExtendedPoint> {
        self.orbits
            .iter()
            .filter(|orbit| orbit.period == period)
            .flat_map(|o| o.extended_points.clone())
            .collect()
    }
}

#[derive(Debug, Clone, Copy)]
#[wasm_bindgen]
pub enum PeriodicType {
    Stable,
    Unstable,
    Saddle,
}

pub enum PointClassification {
    Regular,
    NearPeriodicOrbit {
        period: usize,
        stability: StabilityType,
        distance: f64,
    },
}

// Retained only for focused algebra tests. Production periodic calculations use
// the 4D Jacobian implementation below.
#[cfg(test)]
#[derive(Debug, Clone, Copy)]
pub struct Jacobian {
    pub j11: f64,
    pub j12: f64,
    pub j21: f64,
    pub j22: f64,
}

#[cfg(test)]
impl Jacobian {
    pub fn new(j11: f64, j12: f64, j21: f64, j22: f64) -> Self {
        Self { j11, j12, j21, j22 }
    }

    pub fn identity() -> Self {
        Self {
            j11: 1.0,
            j12: 0.0,
            j21: 0.0,
            j22: 1.0,
        }
    }

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
}

// 4x4 matrix for extended boundary map
#[derive(Copy, Clone)]
pub struct Jacobian4x4 {
    pub data: [[f64; 4]; 4],
}

impl Jacobian4x4 {
    pub fn identity() -> Self {
        Self {
            data: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }

    pub fn multiply(&self, other: &Jacobian4x4) -> Jacobian4x4 {
        let mut result = [[0.0; 4]; 4];
        for (i, result_row) in result.iter_mut().enumerate() {
            for (j, cell) in result_row.iter_mut().enumerate() {
                for k in 0..4 {
                    *cell += self.data[i][k] * other.data[k][j];
                }
            }
        }
        Jacobian4x4 { data: result }
    }

    pub fn subtract_identity(&self) -> Jacobian4x4 {
        let mut result = self.data;
        for (i, row) in result.iter_mut().enumerate() {
            row[i] -= 1.0;
        }
        Jacobian4x4 { data: result }
    }

    // Compute eigenvalues of 4x4 matrix using companion matrix approach
    // Returns up to 4 eigenvalue magnitudes
    pub fn eigenvalue_magnitudes(&self) -> Vec<f64> {
        // Compute eigenvalues using QR algorithm approximation
        // For simplicity, we compute characteristic polynomial and find roots

        let a = &self.data;
        // Characteristic polynomial coefficient for 4x4 matrix
        // det(A - lamda * I) = lambda^4 - p1*lambda^3 + p2*lambda^2 - p3*lambda + p4 = 0

        // use trace and other invariants
        let trace = a[0][0] + a[1][1] + a[2][2] + a[3][3];

        let sum_2x2_minors = (a[0][0] * a[1][1] - a[0][1] * a[1][0])
            + (a[0][0] * a[2][2] - a[0][2] * a[2][0])
            + (a[0][0] * a[3][3] - a[0][3] * a[3][0])
            + (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            + (a[1][1] * a[3][3] - a[1][3] * a[3][1])
            + (a[2][2] * a[3][3] - a[2][3] * a[3][2]);

        // sum 3x3 principle minor
        let det_3x3_012 = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

        let det_3x3_013 = a[0][0] * (a[1][1] * a[3][3] - a[1][3] * a[3][1])
            - a[0][1] * (a[1][0] * a[3][3] - a[1][3] * a[3][0])
            + a[0][3] * (a[1][0] * a[3][1] - a[1][1] * a[3][0]);

        let det_3x3_023 = a[0][0] * (a[2][2] * a[3][3] - a[2][3] * a[3][2])
            - a[0][2] * (a[2][0] * a[3][3] - a[2][3] * a[3][0])
            + a[0][3] * (a[2][0] * a[3][2] - a[2][2] * a[3][0]);

        let det_3x3_123 = a[1][1] * (a[2][2] * a[3][3] - a[2][3] * a[3][2])
            - a[1][2] * (a[2][1] * a[3][3] - a[2][3] * a[3][1])
            + a[1][3] * (a[2][1] * a[3][2] - a[2][2] * a[3][1]);
        let sum_3x3_minors = det_3x3_012 + det_3x3_013 + det_3x3_023 + det_3x3_123;

        // 4x4 determinant
        let determinant = self.determinant();

        // characteristic polynomial: lambda^4 - p1*lambda^3 + p2*lambda^2 - p3*lambda + p4 = 0

        let p1 = trace;
        let p2 = sum_2x2_minors;
        let p3 = sum_3x3_minors;
        let p4 = determinant;

        // Find root numerically using companion matrix eigenvalues
        self.find_polynomial_root_quartic(p1, p2, p3, p4)
    }

    pub fn determinant(&self) -> f64 {
        let a = &self.data;
        // Laplace expansion along first row
        let minor00 = a[1][1] * (a[2][2] * a[3][3] - a[2][3] * a[3][2])
            - a[1][2] * (a[2][1] * a[3][3] - a[2][3] * a[3][1])
            + a[1][3] * (a[2][1] * a[3][2] - a[2][2] * a[3][1]);

        let minor01 = a[1][0] * (a[2][2] * a[3][3] - a[2][3] * a[3][2])
            - a[1][2] * (a[2][0] * a[3][3] - a[2][3] * a[3][0])
            + a[1][3] * (a[2][0] * a[3][2] - a[2][2] * a[3][0]);

        let minor02 = a[1][0] * (a[2][1] * a[3][3] - a[2][3] * a[3][1])
            - a[1][1] * (a[2][0] * a[3][3] - a[2][3] * a[3][0])
            + a[1][3] * (a[2][0] * a[3][1] - a[2][1] * a[3][0]);

        let minor03 = a[1][0] * (a[2][1] * a[3][2] - a[2][2] * a[3][1])
            - a[1][1] * (a[2][0] * a[3][2] - a[2][2] * a[3][0])
            + a[1][2] * (a[2][0] * a[3][1] - a[2][1] * a[3][0]);

        a[0][0] * minor00 - a[0][1] * minor01 + a[0][2] * minor02 - a[0][3] * minor03
    }

    pub fn find_polynomial_root_quartic(&self, p1: f64, p2: f64, p3: f64, p4: f64) -> Vec<f64> {
        // Finding roots of x^4 - p1*x^3 + p2*x^2 - p3*x + p4 = 0
        // Using Newton's method with multiple starting points

        let f = |x: f64| x.powi(4) - p1 * x.powi(3) + p2 * x.powi(2) - p3 * x + p4;
        let df = |x: f64| 4.0 * x.powi(3) - 3.0 * p1 * x.powi(2) + 2.0 * p2 * x - p3;

        let mut roots = Vec::new();
        let starts = [-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0];

        for start in starts {
            let mut x = start;
            for _ in 0..50 {
                let fx = f(x);
                let dfx = df(x);
                if dfx.abs() < 1e-12 {
                    break;
                }
                let x_new = x - fx / dfx;
                if (x_new - x).abs() < 1e-10 {
                    x = x_new;
                    break;
                }
                x = x_new;
            }

            if f(x).abs() < 1e-6 {
                // check if this is a new root
                let is_new = roots.iter().all(|&r: &f64| (r - x).abs() > 0.01);
                if is_new {
                    roots.push(x);
                }
            }
        }
        roots.iter().map(|r| r.abs()).collect()
    }

    // invert 4x4 matrix using Gaussian elimination
    pub fn inverse(&self) -> Option<Jacobian4x4> {
        let mut a = self.data;
        let mut inv = [[0.0; 4]; 4];
        for (i, row) in inv.iter_mut().enumerate() {
            row[i] = 1.0;
        }

        for col in 0..4 {
            let mut max_row = col;
            for row in (col + 1)..4 {
                if a[row][col].abs() > a[max_row][col].abs() {
                    max_row = row;
                }
            }

            a.swap(col, max_row);
            inv.swap(col, max_row);

            // check for singular matrix
            if a[col][col].abs() < 1e-12 {
                return None;
            }

            let pivot = a[col][col];
            for j in 0..4 {
                a[col][j] /= pivot;
                inv[col][j] /= pivot;
            }

            for row in 0..4 {
                if row != col {
                    let factor = a[row][col];
                    for j in 0..4 {
                        a[row][j] -= factor * a[col][j];
                        inv[row][j] -= factor * inv[col][j];
                    }
                }
            }
        }
        Some(Jacobian4x4 { data: inv })
    }
}

pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
    pub classification: PointClassification,
}

/// Legacy ambient classifier retained for compatibility with v0.2 callers.
///
/// New periodic-orbit calculations use [`classify_stability_reduced`]. Merely
/// filtering a numerically computed zero eigenvalue is less reliable than
/// restricting the derivative to `T(R^2 x S^1)` before eigendecomposition.
pub fn classify_stability_4d(jac: &Jacobian4x4) -> (StabilityType, Vec<f64>) {
    let eigenvalues = jac.eigenvalue_magnitudes();

    // filter out non-zero eigenvalues
    let nonzero_eigenvalues: Vec<f64> = eigenvalues.into_iter().filter(|&e| e > 1e-5).collect();
    if nonzero_eigenvalues.is_empty() {
        return (StabilityType::Stable, vec![]);
    }

    let all_stable = nonzero_eigenvalues.iter().all(|&e| e < 0.999);
    let all_unstable = nonzero_eigenvalues.iter().all(|&e| e > 1.001);

    let stability = if all_stable {
        StabilityType::Stable
    } else if all_unstable {
        StabilityType::Unstable
    } else {
        StabilityType::Saddle
    };

    (stability, nonzero_eigenvalues)
}

/// Classify the three physical multipliers of a boundary-map periodic point.
pub fn classify_stability_reduced(
    jac: &Jacobian4x4,
    normal: Vector2<f64>,
) -> Result<(StabilityType, Vec<f64>), String> {
    let matrix = Matrix4::from_row_slice(&jac.data.concat());
    let reduced = reduce_periodic_monodromy(matrix, normal)?;
    let mut eigenvalues = reduced_eigenvalue_magnitudes(&reduced).to_vec();
    if eigenvalues.iter().any(|value| !value.is_finite()) {
        return Err("Reduced boundary-map eigensolver returned non-finite multipliers".to_string());
    }
    eigenvalues.sort_by(f64::total_cmp);

    let all_stable = eigenvalues.iter().all(|&value| value < 0.999);
    let all_unstable = eigenvalues.iter().all(|&value| value > 1.001);
    let stability = if all_stable {
        StabilityType::Stable
    } else if all_unstable {
        StabilityType::Unstable
    } else {
        StabilityType::Saddle
    };
    Ok((stability, eigenvalues))
}

#[derive(Clone, Debug)]
pub struct ReducedMonodromyDiagnostics {
    pub matrix: [[f64; 3]; 3],
    pub multiplier_magnitudes: [f64; 3],
    pub multiplier_relation_residual: f64,
}

/// Compute thesis-aligned reduced monodromy diagnostics for a periodic state.
pub fn reduced_periodic_diagnostics(
    system: &dyn DynamicalSystem,
    point: ExtendedPoint,
    period: usize,
) -> Result<ReducedMonodromyDiagnostics, String> {
    if period == 0 {
        return Err("Periodic diagnostics require period >= 1".to_string());
    }
    let (image, derivative) = compose_boundary_map_n_times_generic(system, point, period);
    if !image.is_finite() {
        return Err("Periodic diagnostics encountered a non-finite image".to_string());
    }
    let residual = ((image.x - point.x).powi(2)
        + (image.y - point.y).powi(2)
        + (image.nx - point.nx).powi(2)
        + (image.ny - point.ny).powi(2))
    .sqrt();
    if residual > 1e-6 {
        return Err(format!(
            "State is not periodic to the required tolerance (residual {residual:e})"
        ));
    }
    let embedded = Matrix4::from_row_slice(&derivative.data.concat());
    let reduced = reduce_periodic_monodromy(embedded, Vector2::new(point.nx, point.ny))?;
    let matrix = std::array::from_fn(|row| std::array::from_fn(|column| reduced[(row, column)]));
    Ok(ReducedMonodromyDiagnostics {
        matrix,
        multiplier_magnitudes: reduced_eigenvalue_magnitudes(&reduced),
        multiplier_relation_residual: multiplier_relation_residual(&reduced),
    })
}
