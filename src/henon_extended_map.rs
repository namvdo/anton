//! Shared point formulas for the deterministic Hénon extended boundary map.
//!
//! Keeping these formulas in one module prevents forward and inverse
//! geometric-curve calculations from drifting apart numerically.

const NORMAL_EPSILON: f64 = 1e-14;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct HenonExtendedPoint {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
}

fn validate_parameters(a: f64, b: f64, epsilon: f64) -> Result<(), String> {
    if !a.is_finite() {
        return Err("Hénon parameter a must be finite".to_string());
    }
    if !b.is_finite() || b.abs() < 1e-12 {
        return Err("Hénon parameter b must be finite and nonzero".to_string());
    }
    if !epsilon.is_finite() || epsilon < 0.0 {
        return Err("Boundary-map epsilon must be finite and nonnegative".to_string());
    }
    Ok(())
}

fn normalized_normal(nx: f64, ny: f64, context: &str) -> Result<(f64, f64), String> {
    let length = nx.hypot(ny);
    if !length.is_finite() || length < NORMAL_EPSILON {
        return Err(format!("{context} produced a degenerate normal"));
    }
    Ok((nx / length, ny / length))
}

pub(crate) fn forward_henon_extended_point(
    state: HenonExtendedPoint,
    a: f64,
    b: f64,
    epsilon: f64,
) -> Result<HenonExtendedPoint, String> {
    validate_parameters(a, b, epsilon)?;
    if ![state.x, state.y, state.nx, state.ny]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err("Extended boundary-map state must be finite".to_string());
    }
    let (nx, ny) = normalized_normal(state.nx, state.ny, "Extended boundary map")?;
    let raw_nx = ny;
    let raw_ny = (nx + 2.0 * a * state.x * ny) / b;
    let (next_nx, next_ny) = normalized_normal(raw_nx, raw_ny, "Extended boundary map")?;
    let next = HenonExtendedPoint {
        x: 1.0 - a * state.x * state.x + state.y + epsilon * next_nx,
        y: b * state.x + epsilon * next_ny,
        nx: next_nx,
        ny: next_ny,
    };
    if ![next.x, next.y, next.nx, next.ny]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err("Extended boundary map produced a non-finite state".to_string());
    }
    Ok(next)
}

pub(crate) fn inverse_henon_extended_point(
    state: HenonExtendedPoint,
    a: f64,
    b: f64,
    epsilon: f64,
) -> Result<HenonExtendedPoint, String> {
    validate_parameters(a, b, epsilon)?;
    if ![state.x, state.y, state.nx, state.ny]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err("Inverse extended boundary-map state must be finite".to_string());
    }
    let (mx, my) = normalized_normal(state.nx, state.ny, "Inverse extended boundary map")?;
    let x = (state.y - epsilon * my) / b;
    let y = state.x - epsilon * mx - 1.0 + a * x * x;
    let raw_nx = -2.0 * a * x * mx + b * my;
    let raw_ny = mx;
    let (nx, ny) = normalized_normal(raw_nx, raw_ny, "Inverse extended boundary map")?;
    let previous = HenonExtendedPoint { x, y, nx, ny };
    if ![previous.x, previous.y, previous.nx, previous.ny]
        .iter()
        .all(|value| value.is_finite())
    {
        return Err("Inverse extended boundary map produced a non-finite state".to_string());
    }
    Ok(previous)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_point_formula_round_trips_extended_states() {
        let state = HenonExtendedPoint {
            x: 0.7,
            y: -0.2,
            nx: 0.6,
            ny: 0.8,
        };
        let image = forward_henon_extended_point(state, 0.4, 0.3, 0.1).unwrap();
        let recovered = inverse_henon_extended_point(image, 0.4, 0.3, 0.1).unwrap();
        for (actual, expected) in [recovered.x, recovered.y, recovered.nx, recovered.ny]
            .into_iter()
            .zip([state.x, state.y, state.nx, state.ny])
        {
            assert!((actual - expected).abs() < 1e-12);
        }
    }

    #[test]
    fn shared_inverse_rejects_singular_parameters_and_normals() {
        let point = HenonExtendedPoint {
            x: 0.0,
            y: 0.0,
            nx: 1.0,
            ny: 0.0,
        };
        assert!(inverse_henon_extended_point(point, 0.4, 0.0, 0.1).is_err());
        assert!(inverse_henon_extended_point(
            HenonExtendedPoint {
                nx: 0.0,
                ny: 0.0,
                ..point
            },
            0.4,
            0.3,
            0.1
        )
        .is_err());
    }
}
