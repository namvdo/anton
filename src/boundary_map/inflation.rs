//! Forward state-dependent uncertainty inflation on the unit normal bundle.
//!
//! This only implements the geometric inflation step for now.
//!
//!  (y, m) -> (z, n')
//!
//! after the determistic map and inverse-transpose normal transport have
//! already produced the center y and the center-boundary normal m.

use nalgebra::Vector2;
use std::error::Error;
use std::fmt::{Display, Formatter};

use super::uncertainty_radius::{
    UncertaintyRadiusError, UncertaintyRadiusField2D, UncertaintyRadiusSample,
};

const NORMAL_LENGTH_EPSILON: f64 = 1e-14;
const UNIT_NORMAL_INVARIANT_TOLERANCE: f64 = 1e-10;

#[derive(Clone, Debug, PartialEq)]
pub enum InflationError {
    UncertaintyRadius(UncertaintyRadiusError),
    NonFiniteCenter { x: f64, y: f64 },
    InvalidCenterNormal { nx: f64, ny: f64 },
    GradientBoundViolated { gradient_norm: f64 },
    InvalidNormalRadicand { radicand: f64 },
    DegenerateRecipientNormal { length: f64 },
    UnitNormalInvariantViolated { length: f64 },
    NonFiniteRecipient { x: f64, y: f64 },
}

impl Display for InflationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UncertaintyRadius(error) => write!(
                formatter,
                "Uncertainty radius field evaluation failed: {error}"
            ),
            Self::NonFiniteCenter { x, y } => write!(
                formatter,
                "Inflation center must be finite, got: ({x}, {y})"
            ),
            Self::InvalidCenterNormal { nx, ny } => write!(
                formatter,
                "Inflation normal must be finite and non-zero, but received: ({nx}, {ny})"
            ),
            Self::GradientBoundViolated { gradient_norm } => write!(
                formatter,
                "State-dependent uncertainty inflation requires || gradient(epsilon) || < 1, \
                    but received gradient norm: {gradient_norm}"
            ),
            Self::InvalidNormalRadicand { radicand } => write!(
                formatter,
                "Recipient-normal construction has invalid radicand: {radicand}"
            ),
            Self::DegenerateRecipientNormal { length } => write!(
                formatter,
                "Recipient-normal construction produced invalid length {length}"
            ),
            Self::UnitNormalInvariantViolated { length } => write!(
                formatter,
                "Recipient-normal formula should produce unit length, \
                     but produced {length}"
            ),
            Self::NonFiniteRecipient { x, y } => write!(
                formatter,
                "Inflation produced a non-finite recipient point ({x}, {y})"
            ),
        }
    }
}

impl Error for InflationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::UncertaintyRadius(error) => Some(error as &(dyn Error + 'static)),
            _ => None,
        }
    }
}

impl From<UncertaintyRadiusError> for InflationError {
    fn from(value: UncertaintyRadiusError) -> Self {
        Self::UncertaintyRadius(value)
    }
}

/// Result of one forward state-dependent inflation step
///
/// Additional geometric quantities are retained as diagnostics
#[derive(Debug, Copy, PartialEq, Clone)]
pub struct InflationStep {
    pub center: Vector2<f64>,
    pub center_normal: Vector2<f64>,
    pub recipient: Vector2<f64>,
    pub recipient_normal: Vector2<f64>,
    pub radius: f64,
    pub gradient: Vector2<f64>,
    pub tangential_gradient: Vector2<f64>,
    pub normal_gradient_component: f64,
    pub tangiential_gradient_norm: f64,
    pub gradient_margin: f64,
    pub normal_radicand: f64,
}

/// Evaluate an uncertainty radius field at `center` and perform forward inflation.
///
/// In the boundary map, the center is the deterministic image
///     center = f(x) = y
pub fn inflate_forward<U>(
    center: Vector2<f64>,
    center_normal: Vector2<f64>,
    uncertainty_radius: &U,
) -> Result<InflationStep, InflationError>
where
    U: UncertaintyRadiusField2D + ?Sized,
{
    let sample = uncertainty_radius.sample(center)?;
    inflate_forward_sample(center, center_normal, sample)
}

/// Perform forward inflation from a pre-evalated uncertainty radius sample.
///
/// This makes the mathematical kernel easy to test without requiring a particular
/// uncertainty radius implementation.
pub fn inflate_forward_sample(
    center: Vector2<f64>,
    center_normal: Vector2<f64>,
    sample: UncertaintyRadiusSample,
) -> Result<InflationStep, InflationError> {
    validate_center(center)?;

    let center_normal = normalize_center_normal(center_normal)?;

    let radius = sample.radius();
    let gradient = sample.gradient();
    let gradient_norm = gradient.norm();

    if !gradient_norm.is_finite() || gradient_norm >= 1.0 {
        return Err(InflationError::GradientBoundViolated { gradient_norm });
    }

    // decompose the uncertainty radius gradient into components normal and tangent to
    // the deterministic-image boundary:
    // g = a m + g_T
    // a = <m, g>
    // g_T = g - a m.

    let normal_gradient_component = center_normal.dot(&gradient);
    let tangential_gradient = gradient - normal_gradient_component * center_normal;

    let tangential_gradient_norm_squared = tangential_gradient.norm_squared();

    /*
     * The recipient normal is:
     *   n' = q m - g_T
     *   with
     *
     *   q = sqrt(1 - ||g_T||^2)
     */

    let normal_radicand = 1.0 - tangential_gradient_norm_squared;

    if !normal_radicand.is_finite() || normal_radicand <= 0.0 {
        return Err(InflationError::InvalidNormalRadicand {
            radicand: normal_radicand,
        });
    }
    let normal_component = normal_radicand.sqrt();
    let raw_recipient_normal = normal_component * center_normal - tangential_gradient;

    let raw_normal_length = raw_recipient_normal.norm();

    if !raw_normal_length.is_finite() || raw_normal_length <= NORMAL_LENGTH_EPSILON {
        return Err(InflationError::DegenerateRecipientNormal {
            length: raw_normal_length,
        });
    }

    if (raw_normal_length - 1.0).abs() > UNIT_NORMAL_INVARIANT_TOLERANCE {
        return Err(InflationError::UnitNormalInvariantViolated {
            length: raw_normal_length,
        });
    }

    let recipient_normal = raw_recipient_normal / raw_normal_length;

    let recipient = center + radius * recipient_normal;

    if !recipient.x.is_finite() || !recipient.y.is_finite() {
        return Err(InflationError::NonFiniteRecipient {
            x: recipient.x,
            y: recipient.y,
        });
    }

    Ok(InflationStep {
        center,
        center_normal,
        recipient,
        recipient_normal,
        radius,
        gradient,
        tangential_gradient,
        normal_gradient_component,
        tangiential_gradient_norm: tangential_gradient_norm_squared.sqrt(),
        gradient_margin: 1.0 - gradient_norm,
        normal_radicand,
    })
}

fn validate_center(center: Vector2<f64>) -> Result<(), InflationError> {
    if !center.x.is_finite() || !center.y.is_finite() {
        return Err(InflationError::NonFiniteCenter {
            x: center.x,
            y: center.y,
        });
    }

    Ok(())
}

fn normalize_center_normal(normal: Vector2<f64>) -> Result<Vector2<f64>, InflationError> {
    let length = normal.norm();

    if !normal.x.is_finite()
        || !normal.y.is_finite()
        || !length.is_finite()
        || length <= NORMAL_LENGTH_EPSILON
    {
        return Err(InflationError::InvalidCenterNormal {
            nx: normal.x,
            ny: normal.y,
        });
    }
    Ok(normal / length)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::boundary_map::uncertainty_radius::{
        ConstantUncertaintyRadius, SinusoidalUncertaintyRadius, UncertaintyRadiusSample,
    };

    const TEST_TOLERANCE: f64 = 1e-12;

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= TEST_TOLERANCE,
            "expected: {expected:.16e}, received: {actual:.16e}"
        );
    }

    fn assert_vector_close(actual: Vector2<f64>, expected: Vector2<f64>) {
        assert!(
            (actual - expected).norm() <= TEST_TOLERANCE,
            "Expected {expected:?}, received {actual:?}"
        )
    }

    #[test]
    fn constant_uncertainty_radius_the_classical_offset_formula() {
        let center = Vector2::new(1.0, -2.0);
        let input_normal = Vector2::new(3.0, 4.0);
        let uncertain_radius = ConstantUncertaintyRadius::new(0.25).unwrap();

        let result = inflate_forward(center, input_normal, &uncertain_radius).unwrap();

        let unit_normal = Vector2::new(0.6, 0.8);
        let expected_recipient = center + 0.25 * unit_normal;

        assert_vector_close(result.center_normal, unit_normal);
        assert_vector_close(result.recipient_normal, unit_normal);
        assert_vector_close(result.recipient, expected_recipient);
        assert_vector_close(result.gradient, Vector2::zeros());
        assert_vector_close(result.tangential_gradient, Vector2::zeros());
        assert_close(result.normal_radicand, 1.0);
    }

    #[test]
    fn tangiential_gradient_rotates_the_recipient_normal() {
        let center = Vector2::new(0.0, 0.0);
        let center_normal = Vector2::new(0.0, 1.0);
        let gradient = Vector2::new(0.3, 0.2);
        let sample = UncertaintyRadiusSample::new(0.5, gradient).unwrap();

        let result = inflate_forward_sample(center, center_normal, sample).unwrap();

        /***
         * m = (0, 1)
         * a = <m,g> = 0.2
         * g_T = g - a m = (0.3, 0.0)
         * q = sqrt(1 - 0.3^2) = sqrt(0.91)
         * n' = q m - g_T = (-0.3, sqrt(0.91))
         */

        let expected_normal = Vector2::new(-0.3, 0.91_f64.sqrt());

        assert_vector_close(result.tangential_gradient, Vector2::new(0.3, 0.0));
        assert_close(result.normal_gradient_component, 0.2);
        assert_close(result.normal_radicand, 0.91);
        assert_vector_close(result.recipient_normal, expected_normal);
        assert_vector_close(result.recipient, center + 0.5 * expected_normal);
    }

    #[test]
    fn purely_normal_gradient_does_not_rotate_the_normal() {
        let center = Vector2::new(1.0, 2.0);
        let center_normal = Vector2::new(0.6, 0.8);
        let gradient = 0.75 * center_normal;
        let sample = UncertaintyRadiusSample::new(0.2, gradient).unwrap();

        let result = inflate_forward_sample(center, center_normal, sample).unwrap();

        assert_vector_close(result.tangential_gradient, Vector2::zeros());

        assert_vector_close(result.recipient_normal, center_normal);
        assert_vector_close(result.recipient, center + 0.2 * center_normal);
    }

    #[test]
    fn recipient_normal_satisfies_the_contact_condition() {
        let center = Vector2::new(-0.4, 0.7);
        let center_normal = Vector2::new(0.6, 0.8);
        let tangent = Vector2::new(-center_normal.y, center_normal.x);
        let gradient = 0.2 * center_normal + 0.5 * tangent;
        let sample = UncertaintyRadiusSample::new(0.15, gradient).unwrap();

        let result = inflate_forward_sample(center, center_normal, sample).unwrap();

        /**
         * we have the contributor-recipient contact condition is
         *
         * (n' + gradient (epsilon) dot tangent = 0 )
         *
         * therefore n' + gradient epsilon must be parallel to m
         */
        let contact_residual = (result.recipient_normal + gradient).dot(&tangent);

        assert!(
            contact_residual.abs() <= TEST_TOLERANCE,
            "Contact residual was {contact_residual:.16e}",
        );
    }

    #[test]
    fn tangential_formula_matches_paper_formula() {
        let center = Vector2::new(0.3, -0.8);
        let input_normal = Vector2::new(2.0, -1.0);
        let center_normal = input_normal / input_normal.norm();
        let gradient = Vector2::new(0.25, 0.35);
        let sample = UncertaintyRadiusSample::new(0.1, gradient).unwrap();

        let result = inflate_forward_sample(center, center_normal, sample).unwrap();

        /**
         * Paper form:
         *  a = <m, g>
         *  q = sqrt(a^2 - ||g||^2 + 1)
         *  c = a + q
         *  n' = c m - g
         */
        let a = center_normal.dot(&gradient);
        let q = (a * a - gradient.norm_squared() + 1.0).sqrt();
        let c = a + q;
        let paper_normal = c * center_normal - gradient;

        assert_vector_close(result.recipient_normal, paper_normal);
    }

    #[test]
    fn recipient_remains_unit_over_many_directions() {
        for normal_index in 0..64 {
            let theta = std::f64::consts::TAU * normal_index as f64 / 64.0;

            let normal = Vector2::new(theta.cos(), theta.sin());
            let tangent = Vector2::new(-normal.y, normal.x);

            for tangent_gradient in [-0.8, -0.4, 0.0, 0.4, 0.8] {
                let gradient = 0.2 * normal + tangent_gradient * tangent;

                assert!(gradient.norm() < 1.0);

                let sample = UncertaintyRadiusSample::new(0.1, gradient).unwrap();

                let result =
                    inflate_forward_sample(Vector2::new(0.1, -0.2), normal, sample).unwrap();

                assert_close(result.recipient_normal.norm(), 1.0);

                let contact_residual = (result.recipient_normal + gradient).dot(&tangent);

                assert!(
                    contact_residual.abs() <= TEST_TOLERANCE,
                    "Contact residual was {contact_residual:.16e}"
                );
            }
        }
    }

    #[test]
    fn gradient_equal_to_one_is_rejected() {
        let sample = UncertaintyRadiusSample::new(0.1, Vector2::new(1.0, 0.0)).unwrap();

        let error =
            inflate_forward_sample(Vector2::zeros(), Vector2::new(0.0, 1.0), sample).unwrap_err();

        assert!(matches!(
            error,
            InflationError::GradientBoundViolated { .. }
        ));
    }

    #[test]
    fn invalid_center_or_normal_is_rejected() {
        let sample = UncertaintyRadiusSample::new(0.1, Vector2::zeros()).unwrap();

        assert!(inflate_forward_sample(
            Vector2::new(f64::NAN, 0.0),
            Vector2::new(1.0, 0.0),
            sample
        )
        .is_err());

        assert!(inflate_forward_sample(Vector2::zeros(), Vector2::zeros(), sample).is_err());

        assert!(
            inflate_forward_sample(Vector2::zeros(), Vector2::new(f64::INFINITY, 0.0), sample)
                .is_err()
        )
    }

    #[test]
    fn forward_inflation_evaluates_uncertainty_radius_at_the_supplied_center() {
        let epsilon_0 = 0.2;
        let uncertainty_radius = SinusoidalUncertaintyRadius::new(epsilon_0).unwrap();

        let center = Vector2::new(std::f64::consts::FRAC_PI_2, 0.0);

        let center_normal = Vector2::new(0.0, 1.0);

        let result = inflate_forward(center, center_normal, &uncertainty_radius).unwrap();

        /***
         * At x + y = pi/2
         * epsilon = 1.5 epsilon_0
         * gradient(epsilon) = 0
         */

        assert_close(result.radius, 1.5 * epsilon_0);
        assert_vector_close(result.gradient, Vector2::zeros());
        assert_vector_close(result.recipient_normal, center_normal);

        assert_vector_close(result.recipient, center + 1.5 * epsilon_0 * center_normal);
    }
}
