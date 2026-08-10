//! Explicit bounded-noise geometry for set-oriented computations.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NoiseGeometry {
    /// Euclidean disk `||eta||_2 <= epsilon`, used by the boundary map.
    Euclidean,
    /// Axis-aligned square `||eta||_infinity <= epsilon`, used by the GAIO
    /// implementation in Peschke's master thesis.
    LInfinity,
}

pub fn box_intersects_noise_set(
    box_center: (f64, f64),
    box_radius: (f64, f64),
    image_point: (f64, f64),
    epsilon: f64,
    geometry: NoiseGeometry,
) -> Result<bool, String> {
    if ![
        box_center.0,
        box_center.1,
        box_radius.0,
        box_radius.1,
        image_point.0,
        image_point.1,
        epsilon,
    ]
    .iter()
    .all(|value| value.is_finite())
        || box_radius.0 < 0.0
        || box_radius.1 < 0.0
        || epsilon < 0.0
    {
        return Err("Noise-set intersection requires finite nonnegative radii".to_string());
    }

    let dx = (image_point.0 - box_center.0).abs();
    let dy = (image_point.1 - box_center.1).abs();
    if dx > box_radius.0 + epsilon || dy > box_radius.1 + epsilon {
        return Ok(false);
    }
    if geometry == NoiseGeometry::LInfinity {
        return Ok(true);
    }
    if dx <= box_radius.0 || dy <= box_radius.1 {
        return Ok(true);
    }
    let corner_distance_squared = (dx - box_radius.0).powi(2) + (dy - box_radius.1).powi(2);
    Ok(corner_distance_squared <= epsilon * epsilon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn euclidean_and_l_infinity_noise_differ_at_square_corner() {
        let center = (0.0, 0.0);
        let radius = (0.1, 0.1);
        let point = (0.19, 0.19);
        assert!(
            !box_intersects_noise_set(center, radius, point, 0.1, NoiseGeometry::Euclidean)
                .unwrap()
        );
        assert!(
            box_intersects_noise_set(center, radius, point, 0.1, NoiseGeometry::LInfinity).unwrap()
        );
    }
}
