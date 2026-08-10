//! Linearization on the physical extended state space `R^2 x S^1`.
//!
//! The normal is stored with two coordinates for convenience, but its radial
//! direction is constrained by `||n|| = 1`. An ambient 4-by-4 Jacobian therefore
//! contains an artificial zero direction. Stability must be computed after
//! restricting the derivative to the three-dimensional tangent space.

use nalgebra::{Complex, Matrix3, Matrix4, SMatrix, Vector2};

pub type TangentFrame = SMatrix<f64, 4, 3>;

const NORMAL_TOLERANCE: f64 = 1e-14;

/// Orthonormal frame for `T_(x,n)(R^2 x S^1)`.
///
/// The first two columns span position space. The third is tangent to the unit
/// circle at `n`; using `(-n_y, n_x)` fixes a reproducible orientation.
pub fn tangent_frame(normal: Vector2<f64>) -> Result<TangentFrame, String> {
    if !normal.x.is_finite() || !normal.y.is_finite() {
        return Err("Normal coordinates must be finite".to_string());
    }
    let norm = normal.norm();
    if norm < NORMAL_TOLERANCE {
        return Err("Cannot construct a tangent frame from a zero normal".to_string());
    }
    let n = normal / norm;
    Ok(TangentFrame::from_columns(&[
        nalgebra::Vector4::new(1.0, 0.0, 0.0, 0.0),
        nalgebra::Vector4::new(0.0, 1.0, 0.0, 0.0),
        nalgebra::Vector4::new(0.0, 0.0, -n.y, n.x),
    ]))
}

/// Restrict an embedded derivative to source and target tangent spaces.
///
/// This implements `U_target^T D E U_source`, the reduced derivative used in
/// Wei Hao's boundary-map stability analysis.
pub fn reduce_embedded_derivative(
    derivative: Matrix4<f64>,
    source_normal: Vector2<f64>,
    target_normal: Vector2<f64>,
) -> Result<Matrix3<f64>, String> {
    if derivative.iter().any(|value| !value.is_finite()) {
        return Err("Embedded derivative contains non-finite entries".to_string());
    }
    let source = tangent_frame(source_normal)?;
    let target = tangent_frame(target_normal)?;
    Ok(target.transpose() * derivative * source)
}

/// Restrict a periodic monodromy matrix to the tangent space at its base point.
pub fn reduce_periodic_monodromy(
    derivative: Matrix4<f64>,
    normal: Vector2<f64>,
) -> Result<Matrix3<f64>, String> {
    reduce_embedded_derivative(derivative, normal, normal)
}

/// Three physical multipliers of a reduced boundary-map derivative.
pub fn eigenvalues(matrix: &Matrix3<f64>) -> [Complex<f64>; 3] {
    let values = matrix.complex_eigenvalues();
    [values[0], values[1], values[2]]
}

pub fn eigenvalue_magnitudes(matrix: &Matrix3<f64>) -> [f64; 3] {
    eigenvalues(matrix).map(|value| value.norm())
}

/// Scale-independent residual for the identity `lambda_+ lambda_- = lambda_1`.
///
/// The eigenvalue labels are not returned by a general eigensolver, so all
/// three possible choices of `lambda_1` are checked and the smallest residual
/// is reported.
pub fn multiplier_relation_residual(matrix: &Matrix3<f64>) -> f64 {
    let values = eigenvalues(matrix);
    let candidates = [
        (values[1] * values[2] - values[0], values[0]),
        (values[0] * values[2] - values[1], values[1]),
        (values[0] * values[1] - values[2], values[2]),
    ];
    candidates
        .into_iter()
        .map(|(difference, reference)| difference.norm() / reference.norm().max(1.0))
        .fold(f64::INFINITY, f64::min)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tangent_frame_is_orthonormal_and_excludes_radial_direction() {
        let n = Vector2::new(0.6, 0.8);
        let frame = tangent_frame(n).unwrap();
        let gram = frame.transpose() * frame;
        assert!((gram - Matrix3::identity()).norm() < 1e-14);

        let radial = nalgebra::Vector4::new(0.0, 0.0, n.x, n.y);
        assert!((frame.transpose() * radial).norm() < 1e-14);
    }

    #[test]
    fn reduction_removes_the_ambient_radial_multiplier() {
        let derivative = Matrix4::from_diagonal(&nalgebra::Vector4::new(2.0, 0.5, 0.0, 3.0));
        let reduced = reduce_periodic_monodromy(derivative, Vector2::new(1.0, 0.0)).unwrap();
        let mut magnitudes = eigenvalue_magnitudes(&reduced);
        magnitudes.sort_by(f64::total_cmp);
        assert_eq!(magnitudes, [0.5, 2.0, 3.0]);
    }

    #[test]
    fn multiplier_identity_residual_detects_exact_relation() {
        let matrix = Matrix3::from_diagonal(&nalgebra::Vector3::new(2.0, 0.5, 1.0));
        assert!(multiplier_relation_residual(&matrix) < 1e-14);
    }
}
