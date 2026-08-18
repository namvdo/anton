use nalgebra::{Matrix2, Vector2};
use wasm_bindgen::prelude::*;

use crate::ExtendedState;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct DuffingParams {
    pub a: f64,
    pub b: f64,
    pub epsilon: f64,
}

impl DuffingParams {
    pub fn new(a: f64, b: f64, epsilon: f64) -> Result<Self, String> {
        if !a.is_finite() || !b.is_finite() || !epsilon.is_finite() {
            return Err("Parameters must be finite number".to_string());
        }

        if b.abs() < 1e-10 {
            return Err("Parameter b cannot be zero or near zero".to_string());
        }

        if epsilon < 0.0 {
            return Err("Epsilon must be non-negative".to_string());
        }

        if a.abs() > 10.0 || epsilon > 1.0 || b.abs() > 10.0 {
            return Err("Parameters outside reasonable range".to_string());
        }

        Ok(Self { a, b, epsilon })
    }

    /// Duffing map: x_{n+1} = y_n, y_{n+1} = -b * x_n + a*y_n - y_n^3
    pub fn duffing_map(&self, pos: &Vector2<f64>) -> Result<Vector2<f64>, String> {
        if !pos.x.is_finite() || !pos.y.is_finite() {
            return Err("Invalid position: non finite coordinates".to_string());
        }

        let new_x = pos.y;
        let new_y = -self.b * pos.x + self.a * pos.y - pos.y.powi(3);

        if !new_x.is_finite() || !new_y.is_finite() {
            return Err("Duffing map produced non finite values".to_string());
        }

        Ok(Vector2::new(new_x, new_y))
    }

    pub fn duffing_map_inverse(&self, pos: &Vector2<f64>) -> Result<Vector2<f64>, String> {
        if !pos.x.is_finite() || !pos.y.is_finite() {
            return Err("Invalid position: non finite coordinates".to_string());
        }

        // from x_n+1 = y_n => y_n = x_n+1
        let y_prev = pos.x;
        // from y_n+1 = -b * x_n + a*y_n - y_n^3 => x_n = (a*y_n - y_n^3 - y_{n+1}) / b
        let x_prev = (self.a * y_prev - y_prev.powi(3) - pos.y) / self.b;

        if !y_prev.is_finite() || !x_prev.is_finite() {
            return Err("Duffing map inverse produced non finite values".to_string());
        }

        Ok(Vector2::new(x_prev, y_prev))
    }

    pub fn jacobian(&self, pos: Vector2<f64>) -> Matrix2<f64> {
        Matrix2::new(0.0, 1.0, -self.b, self.a - 3.0 * pos.y.powi(2))
    }

    // transform normal vector using J^(-1) ^ T
    pub fn transform_normal(
        &self,
        pos: Vector2<f64>,
        normal: Vector2<f64>,
    ) -> Result<Vector2<f64>, String> {
        if !pos.x.is_finite()
            || !pos.y.is_finite()
            || !normal.x.is_finite()
            || !normal.y.is_finite()
        {
            return Err("Invalid position or normal: non finite coordinates".to_string());
        }

        if !normal.x.is_finite() || !normal.y.is_finite() {
            return Err("Invalid normal: non finite coordinates".to_string());
        }

        // det(J) = b
        // J^{-1} = [[(a - 3y²)/b, -1/b], [1, 0]]
        // (J^{-1})^T = [[(a - 3y²)/b, 1], [-1/b, 0]]

        let factor = self.a - 3.0 * pos.y.powi(2);

        let jac_inv_t = Matrix2::new(factor / self.b, 1.0, -1.0 / self.b, 0.0);

        let transformed = jac_inv_t * normal;
        let norm = transformed.norm();

        if !norm.is_finite() || norm < 1e-10 {
            return Ok(normal);
        }

        let result = transformed / norm;
        if !result.x.is_finite() || !result.y.is_finite() {
            return Ok(normal);
        }

        Ok(result)
    }

    pub fn transform_normal_inverse(
        &self,
        pos: Vector2<f64>,
        normal: Vector2<f64>,
    ) -> Result<Vector2<f64>, String> {
        if !pos.x.is_finite()
            || !pos.y.is_finite()
            || !normal.x.is_finite()
            || !normal.y.is_finite()
        {
            return Err("Invalid position or normal: non finite coordinates".to_string());
        }

        if !normal.x.is_finite() || !normal.y.is_finite() {
            return Err("Invalid normal: non finite coordinates".to_string());
        }

        let jacobian = self.jacobian(pos);
        let jac_t = jacobian.transpose();

        let transformed = jac_t * normal;
        let norm = transformed.norm();

        if !norm.is_finite() || norm < 1e-10 {
            return Ok(normal);
        }

        let result = transformed / norm;
        if !result.x.is_finite() || !result.y.is_finite() {
            return Ok(normal);
        }
        Ok(result)
    }

    // apply duffing map to position
    // transform normal vector
    // project outward by epsilon

    pub fn extended_map(
        &self,
        state: ExtendedState,
        n_periods: usize,
    ) -> Result<ExtendedState, String> {
        let mut current = state;

        for iter in 0..n_periods {
            let new_pos = self.duffing_map(&current.pos)?;
            let new_normal = self.transform_normal(current.pos, current.normal)?;
            let projected_pos = new_pos + self.epsilon * new_normal;

            if !projected_pos.x.is_finite() || !projected_pos.y.is_finite() {
                return Err(format!("Non-finite position at iteration: {}", iter));
            }

            if projected_pos.x.abs() > 1000.0 || projected_pos.y.abs() > 1000.0 {
                return Err(format!("Position diverged at iteration: {}", iter));
            }

            current = ExtendedState {
                pos: projected_pos,
                normal: new_normal,
            }
        }

        Ok(current)
    }

    // extended map inverse (for dual repeller)
    pub fn extended_map_inverse(
        &self,
        state: ExtendedState,
        n_periods: usize,
    ) -> Result<ExtendedState, String> {
        let mut current = state;

        for iter in 0..n_periods {
            let unprojected_pos = current.pos - self.epsilon * current.normal;

            if !unprojected_pos.x.is_finite() || !unprojected_pos.y.is_finite() {
                return Err(format!(
                    "Non-finite unprojected position at iteration: {}",
                    iter
                ));
            }

            let new_pos = self.duffing_map_inverse(&unprojected_pos)?;
            let new_normal = self.transform_normal_inverse(unprojected_pos, current.normal)?;

            if !new_pos.x.is_finite()
                || !new_pos.y.is_finite()
                || !new_normal.x.is_finite()
                || !new_normal.y.is_finite()
            {
                return Err(format!("Non-finite new state at iteration: {}", iter));
            }

            current = ExtendedState {
                pos: new_pos,
                normal: new_normal,
            };
        }

        Ok(current)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_epsilon_extended_map_matches_deterministic_duffing_map() {
        let params = DuffingParams::new(2.75, 0.2, 0.0).unwrap();
        let state = ExtendedState {
            pos: Vector2::new(0.2, -0.1),
            normal: Vector2::new(0.6, 0.8),
        };

        let expected = params.duffing_map(&state.pos).unwrap();
        let actual = params.extended_map(state, 1).unwrap().pos;

        assert!((actual - expected).norm() < 1e-12);
    }

    #[test]
    fn epsilon_validation_accepts_zero_and_rejects_negative_values() {
        assert!(DuffingParams::new(2.75, 0.2, 0.0).is_ok());
        assert!(DuffingParams::new(2.75, 0.2, -f64::EPSILON).is_err());
    }
}
