//! State-dependent uncertainty radius fields on a planar deterministic state space.
//!
//! The deterministic map acts on points `y in X`, where `X` is a subset of R^2. An uncertainty-radius
//! field assigns a non-negative radius `epsilon(y)` and gradient `gradient epsilon(y)` to each deterministic
//! image point.
//!
//! The associated boundary map acts on unit normal bundle `R^2 x S^1`. Evaluating the radius and gradient together
//! in one `RadiusSample` prevents callers from accidentially evaluating them at different deterministic image points.  

use nalgebra::Vector2;
use std::error::Error;
use std::f64::consts::SQRT_2;
use std::fmt::{Display, Formatter};

#[derive(Clone, Debug, PartialEq)]
pub enum UncertaintyRadiusError {
    NonFinitePoint { x: f64, y: f64 },
    InvalidRadius { radius: f64 },
    InvalidGradient { gx: f64, gy: f64 },
    InvalidRadiusUpperBound { upper_bound: f64 },
    NonContractiveGradientBound { upper_bound: f64 },
    NonFiniteEvaluation { quantity: &'static str },
}

impl Display for UncertaintyRadiusError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NonFinitePoint { x, y } => 
                write!(
                    formatter,
                    "Uncertainty radius received a non finite point ({x}, {y})"
                ),
            Self::InvalidRadius { radius } => 
                write!(
                    formatter,
                    "Uncertainty radius must be finite and non-negative, but got: {radius}"
                ),
            Self::InvalidGradient { gx, gy } => 
                write!(
                    formatter,
                    "Uncertainty radius gradient must be finite, but received ({gx}, {gy})"
                ),
            Self::InvalidRadiusUpperBound { upper_bound } => 
                write!(
                    formatter,
                    "Uncertainty radius upper bound must be finite and non-negative, but got: {upper_bound}"
                ),
            Self::NonContractiveGradientBound { upper_bound } =>
                write!(
                    formatter,
                    "Permissible gradient bound must be between 0 <= bound <= 1, but received: {upper_bound}"
                ),
            Self::NonFiniteEvaluation { quantity } => 
                write!(
                    formatter,
                    "Uncertainty radius evaluation produces a non-finite result {quantity}"
                )
        }
    }
}

impl Error for UncertaintyRadiusError {}

/// evaluted 
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UncertaintyRadiusSample {
    radius: f64,
    gradient: Vector2<f64>,
}


impl UncertaintyRadiusSample {
    pub fn new(radius: f64, gradient: Vector2<f64>) -> Result<Self, UncertaintyRadiusError> {
        if !radius.is_finite() || radius <= 0.0 {
            return Err(UncertaintyRadiusError::InvalidRadius { radius });
        }

        if !gradient.x.is_finite() || !gradient.y.is_finite() || !gradient.norm().is_finite() {
            return Err(UncertaintyRadiusError::InvalidGradient { gx: gradient.x, gy: gradient.y });
        }

        Ok(Self {radius, gradient })
    }

    pub fn radius(&self) -> f64 {
        self.radius 
    }

    pub fn gradient(&self) -> Vector2<f64> {
        self.gradient 
    }
}

/// Global bounds proved from the radius formula. 
/// 
/// `radius_upper_bound` is guaranteed to be at least as large 
/// as `epsilon(y)` at every point y
/// 
/// When implementing the inverse map, the unknown backward distance 
/// `t` satisfies `0 <= t <= radius_upper_bound`
/// 
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct UncertaintyRadiusSampleCertificate {
    radius_upper_bound: f64,
    gradient_norm_upper_bound: f64,
}

impl UncertaintyRadiusSampleCertificate {
    pub fn new(radius_upper_bound: f64, gradient_norm_upper_bound: f64) -> Result<Self, UncertaintyRadiusError> {
        if !radius_upper_bound.is_finite() || radius_upper_bound <= 0.0 {
            return Err(UncertaintyRadiusError::InvalidRadiusUpperBound { upper_bound: radius_upper_bound });
        }

        if !gradient_norm_upper_bound.is_finite() || gradient_norm_upper_bound < 0.0 || gradient_norm_upper_bound >= 1.0 {
            return Err(UncertaintyRadiusError::NonContractiveGradientBound { upper_bound: gradient_norm_upper_bound });
        }

        Ok(Self {
            radius_upper_bound,
            gradient_norm_upper_bound
        })
    }


    pub fn radius_upper_bound(&self) -> f64 {
        self.radius_upper_bound
    }

    pub fn gradient_norm_upper_bound(&self) -> f64 {
        self.gradient_norm_upper_bound
    }

    pub fn gradient_margin(&self) -> f64 {
        1.0 - self.gradient_norm_upper_bound
    }
}


pub trait UncertaintyRadiusField2D: Send + Sync {
    // Evaluate the epsilon(y) and its gradient  
    fn sample(&self, point: Vector2<f64>) -> Result<UncertaintyRadiusSample, UncertaintyRadiusError>;

    /// Return analytic global bounds when they are available.
    /// 
    /// `None` means that the field may still be evaluateed locally, 
    /// but no global contraction or inverse-map claim should be made
    fn certificate(&self) -> Option<UncertaintyRadiusSampleCertificate>;
}

/// Constant uncertainty radius 
/// 
/// epsilon(y) = radius 
/// gradient epsilon(y) = 0

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConstantUncertaintyRadius {
    radius: f64,
    certificate: UncertaintyRadiusSampleCertificate,
}

impl ConstantUncertaintyRadius {
    pub fn new(radius: f64) -> Result<Self, UncertaintyRadiusError> {
        if !radius.is_finite() || radius < 0.0 {
            return Err(UncertaintyRadiusError::InvalidRadius { radius });
        }

        let certificate = UncertaintyRadiusSampleCertificate::new(radius, 0.0)?;
        Ok(Self {
            radius, 
            certificate
        })
    }

    pub fn radius(&self) -> f64 { 
        self.radius
    }
}


impl UncertaintyRadiusField2D for ConstantUncertaintyRadius {
    fn sample(&self, point: Vector2<f64>) -> Result<UncertaintyRadiusSample, UncertaintyRadiusError> {
        validate_point(point)?;
        UncertaintyRadiusSample::new(self.radius, Vector2::zeros())
    }

    fn certificate(&self) -> Option<UncertaintyRadiusSampleCertificate> {
        Some(self.certificate)
    }
}

/// Reference state-dependent uncertainty radius:
/// 
/// epsilon(x,y) = epsilon_0 + (1 + 0.5 * sin (x + y))
/// 
/// Its gradient is 
/// 
/// gradient epsilon(x,y)
///     = 0.5 * epsilon_0 * cos(x + y) * (1, 1)
/// and therefore 
/// 
/// sup ||gradient epsilon|| = epsilon_0 / sqrt(2)

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SinusoidalUncertaintyRadius {
    epsilon_0: f64,
    certificate: UncertaintyRadiusSampleCertificate
}

impl SinusoidalUncertaintyRadius {
    pub fn new(epsilon_0: f64) -> Result<Self, UncertaintyRadiusError> {
        if !epsilon_0.is_finite() || epsilon_0 < 0.0 {
            return Err(UncertaintyRadiusError::InvalidRadius { radius: epsilon_0 });
        }

        let radius_upper_bound = 1.5 * epsilon_0;
        let gradient_norm_upper_bound = epsilon_0 / SQRT_2;

        let certificate = 
            UncertaintyRadiusSampleCertificate::new(radius_upper_bound, gradient_norm_upper_bound)?;

        Ok(Self {
            epsilon_0,
            certificate
        })
    }

    pub fn epsilon_0(&self) -> f64 {
        self.epsilon_0
    }
}

impl UncertaintyRadiusField2D for SinusoidalUncertaintyRadius {
    fn sample(&self, point: Vector2<f64>) -> Result<UncertaintyRadiusSample, UncertaintyRadiusError> {
        validate_point(point)?;

        let phase = point.x + point.y;
        if !phase.is_finite() {
            return Err(UncertaintyRadiusError::NonFiniteEvaluation { quantity: "phase x + y" });
        }

        let radius = self.epsilon_0 * (1.0 + 0.5 * phase.sin());
        let gradient_component = 0.5 * self.epsilon_0 * phase.cos();
        let gradient = Vector2::new(gradient_component, gradient_component);

        UncertaintyRadiusSample::new(radius, gradient)
    }

    fn certificate(&self) -> Option<UncertaintyRadiusSampleCertificate> {
        Some(self.certificate) 
    }
}



fn validate_point(point: Vector2<f64>) -> Result<(), UncertaintyRadiusError> {
    if !point.x.is_finite() || !point.y.is_finite() {
        return Err(UncertaintyRadiusError::NonFinitePoint {
            x: point.x,
            y: point.y
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use web_sys::console::assert;

use super::*;
    use std::f64::consts::FRAC_PI_2;

    const TEST_TOLERANCE: f64 = 1e-12;

    fn assert_close(actual: f64, expected: f64){
        assert!(
            (actual - expected).abs() <= TEST_TOLERANCE, 
            "expected {expected:.16e}, received: {actual:.16e}"
        );
    }

    fn assert_vector_close(actual: Vector2<f64>, expected: Vector2<f64> ) {
        let diff_x_squared = (actual.x - expected.x).powi(2);
        let diff_y_squared = (actual.y - expected.y).powi(2);
        let distance = (diff_x_squared + diff_y_squared).sqrt();
        assert!(distance <= TEST_TOLERANCE,
            "expected: {expected:.16e}, received: {actual:.16e}"
        );
    }

    #[test]
    fn reach_sample_rejects_invalid_values() {
        assert!(UncertaintyRadiusSample::new(-0.1, Vector2::zeros()).is_err());
        assert!(UncertaintyRadiusSample::new(f64::NAN, Vector2::zeros()).is_err());
        assert!(UncertaintyRadiusSample::new(0.1, Vector2::new(f64::INFINITY, 0.0)).is_err());
    }

    #[test]
    fn certificate_requires_a_strict_contraction_bound() {
        assert!(UncertaintyRadiusSampleCertificate::new(1.0, 0.5).is_ok());
        assert!(UncertaintyRadiusSampleCertificate::new(1.0, 1.0).is_err());
        assert!(UncertaintyRadiusSampleCertificate::new(1.0, 1.1).is_err());
        assert!(UncertaintyRadiusSampleCertificate::new(1.0, -0.1).is_err());
        assert!(UncertaintyRadiusSampleCertificate::new(-1.0, 0.5).is_err());
    }
}


