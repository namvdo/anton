//! Curvature propagation for planar boundary maps.
//!
//! The formulas follow the image-curve and epsilon-offset construction. They
//! make wedge detection a quantitative test instead of a visual judgement.

use nalgebra::{Matrix2, Vector2};

const GEOMETRY_TOLERANCE: f64 = 1e-12;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CurvatureStep {
    /// Signed curvature after applying the deterministic map.
    pub image_curvature: f64,
    /// Signed curvature after the outward epsilon offset.
    pub offset_curvature: f64,
    /// `1 - epsilon * image_curvature`; zero is the wedge threshold.
    pub offset_denominator: f64,
    /// True once the regular offset formula reaches or passes its singularity.
    pub at_or_beyond_wedge: bool,
}

/// Propagate signed curvature through a smooth planar map and epsilon offset.
///
/// `hessians[0]` and `hessians[1]` are the Hessians of the two map components.
/// The normal is outward and the tangent convention is `(n_y, -n_x)`, matching
/// the convention used in the thesis derivation.
pub fn propagate_curvature(
    jacobian: Matrix2<f64>,
    hessians: [Matrix2<f64>; 2],
    outward_normal: Vector2<f64>,
    curvature: f64,
    epsilon: f64,
) -> Result<CurvatureStep, String> {
    if jacobian.iter().any(|value| !value.is_finite())
        || hessians
            .iter()
            .flat_map(Matrix2::iter)
            .any(|value| !value.is_finite())
        || !curvature.is_finite()
        || !epsilon.is_finite()
        || epsilon < 0.0
    {
        return Err("Curvature propagation requires finite data and epsilon >= 0".to_string());
    }
    let normal_norm = outward_normal.norm();
    if normal_norm < GEOMETRY_TOLERANCE {
        return Err("Curvature propagation requires a nonzero normal".to_string());
    }
    let normal = outward_normal / normal_norm;
    let tangent = Vector2::new(normal.y, -normal.x);
    let v = jacobian * tangent;
    let u = jacobian * normal;
    let speed = v.norm();
    if speed < GEOMETRY_TOLERANCE {
        return Err("The map derivative degenerates along the boundary tangent".to_string());
    }

    let h1 = (tangent.transpose() * hessians[0] * tangent)[0];
    let h2 = (tangent.transpose() * hessians[1] * tangent)[0];
    let mut image_curvature =
        (v.x * (h2 + curvature * u.y) - v.y * (h1 + curvature * u.x)) / speed.powi(3);
    if jacobian.determinant() < 0.0 {
        image_curvature = -image_curvature;
    }

    let denominator = 1.0 - epsilon * image_curvature;
    let at_or_beyond_wedge = denominator <= GEOMETRY_TOLERANCE;
    let offset_curvature = if denominator.abs() <= GEOMETRY_TOLERANCE {
        f64::copysign(f64::INFINITY, image_curvature)
    } else {
        image_curvature / denominator
    };

    Ok(CurvatureStep {
        image_curvature,
        offset_curvature,
        offset_denominator: denominator,
        at_or_beyond_wedge,
    })
}

/// Curvature step specialized to `H_(a,b)(x,y)=(1-a x^2+y, b x)`.
pub fn propagate_henon_curvature(
    a: f64,
    b: f64,
    x: f64,
    outward_normal: Vector2<f64>,
    curvature: f64,
    epsilon: f64,
) -> Result<CurvatureStep, String> {
    let jacobian = Matrix2::new(-2.0 * a * x, 1.0, b, 0.0);
    let hessians = [Matrix2::new(-2.0 * a, 0.0, 0.0, 0.0), Matrix2::zeros()];
    propagate_curvature(jacobian, hessians, outward_normal, curvature, epsilon)
}

pub fn wedge_curvature_threshold(epsilon: f64) -> Result<f64, String> {
    if !epsilon.is_finite() || epsilon <= 0.0 {
        return Err("Wedge threshold requires a positive finite epsilon".to_string());
    }
    Ok(1.0 / epsilon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wei_reference_noise_has_curvature_threshold_sixteen() {
        assert_eq!(wedge_curvature_threshold(0.0625).unwrap(), 16.0);
    }

    #[test]
    fn identity_map_preserves_circle_curvature_before_offset() {
        let step = propagate_curvature(
            Matrix2::identity(),
            [Matrix2::zeros(), Matrix2::zeros()],
            Vector2::new(1.0, 0.0),
            2.0,
            0.1,
        )
        .unwrap();
        assert!((step.image_curvature - 2.0).abs() < 1e-14);
        assert!((step.offset_curvature - 2.5).abs() < 1e-14);
        assert!(!step.at_or_beyond_wedge);
    }

    #[test]
    fn offset_reports_the_wedge_threshold() {
        let step = propagate_curvature(
            Matrix2::identity(),
            [Matrix2::zeros(), Matrix2::zeros()],
            Vector2::new(1.0, 0.0),
            16.0,
            0.0625,
        )
        .unwrap();
        assert!(step.at_or_beyond_wedge);
        assert!(step.offset_curvature.is_infinite());
    }
}
