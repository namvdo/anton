use nalgebra::{Vector2, Vector4};
use serde::Serialize;

use crate::boundary_map::curvature::wedge_curvature_threshold;
use crate::boundary_periodic::{
    reduced_periodic_diagnostics, BoundaryHenonSystemAnalysis, PeriodicSearchConfig,
};
use crate::continuous_ds::DuffingODE;
use crate::dynamical_systems::{DynamicalSystem, ExtendedState, HenonSystem};
use crate::range::PhaseSpaceBounds;
use crate::ulam::UlamComputer;

#[derive(Clone, Debug, Serialize)]
pub struct ValidationCase {
    pub id: &'static str,
    pub passed: bool,
    pub metric: f64,
    pub tolerance: f64,
    pub explanation: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ValidationReport {
    pub software: &'static str,
    pub version: &'static str,
    pub passed: bool,
    pub cases: Vec<ValidationCase>,
}

fn state_error(left: ExtendedState, right: ExtendedState) -> f64 {
    Vector4::new(
        left.pos.x - right.pos.x,
        left.pos.y - right.pos.y,
        left.normal.x - right.normal.x,
        left.normal.y - right.normal.y,
    )
    .norm()
}

fn validate_analytic_henon_fixed_point() -> ValidationCase {
    let (a, b) = (1.4, 0.3);
    let discriminant = (1.0_f64 - b).powi(2) + 4.0 * a;
    let x = (-(1.0 - b) + discriminant.sqrt()) / (2.0 * a);
    let fixed_point = Vector2::new(x, b * x);
    let system = HenonSystem::new(a, b, 0.0);
    let image = system
        .map(fixed_point)
        .expect("finite analytic fixed point");
    let residual = (image - fixed_point).norm();
    let tolerance = 1e-13;

    ValidationCase {
        id: "henon_analytic_fixed_point",
        passed: residual <= tolerance,
        metric: residual,
        tolerance,
        explanation:
            "Euclidean residual ||f(x*)-x*|| for the closed-form positive Hénon fixed point."
                .to_string(),
    }
}

fn validate_extended_map_roundtrip() -> ValidationCase {
    let system = HenonSystem::new(0.4, 0.3, 0.0625);
    let positions = [
        Vector2::new(-0.5, 0.1),
        Vector2::new(0.0, 0.0),
        Vector2::new(0.4, -0.2),
        Vector2::new(0.8, 0.2),
    ];
    let angles = [0.0_f64, 0.7, 1.8, 3.2];
    let mut maximum_error: f64 = 0.0;

    for (position, angle) in positions.into_iter().zip(angles) {
        let initial = ExtendedState {
            pos: position,
            normal: Vector2::new(angle.cos(), angle.sin()),
        };
        let image = system
            .extended_map(initial, 1)
            .expect("finite forward boundary-map state");
        let recovered = system
            .extended_map_inverse(image, 1)
            .expect("invertible Hénon boundary-map state");
        maximum_error = maximum_error.max(state_error(initial, recovered));
    }

    let tolerance = 1e-10;
    ValidationCase {
        id: "extended_boundary_map_roundtrip",
        passed: maximum_error <= tolerance,
        metric: maximum_error,
        tolerance,
        explanation:
            "Maximum 4D error after one forward and one inverse extended Hénon boundary-map step."
                .to_string(),
    }
}

fn validate_periodic_orbit_residuals() -> Result<ValidationCase, String> {
    let bounds = PhaseSpaceBounds::try_new(-2.0, 2.0, -1.5, 1.5)?;
    let search = PeriodicSearchConfig::try_new(2, 8, 8, 1e-9)?;
    let analysis = BoundaryHenonSystemAnalysis::from_config(0.4, 0.3, 0.0625, bounds, search)?;
    let system = HenonSystem::new(0.4, 0.3, 0.0625);
    let mut maximum_residual: f64 = 0.0;

    if analysis.orbit_database.orbits.is_empty() {
        return Ok(ValidationCase {
            id: "periodic_orbit_residual",
            passed: false,
            metric: f64::INFINITY,
            tolerance: 1e-7,
            explanation: "Reference search returned no periodic orbit, so the reference case could not be validated."
                .to_string(),
        });
    }

    for orbit in &analysis.orbit_database.orbits {
        let seed = orbit
            .extended_points
            .first()
            .ok_or_else(|| "Periodic orbit has no extended seed".to_string())?;
        let initial = ExtendedState {
            pos: Vector2::new(seed.x, seed.y),
            normal: Vector2::new(seed.nx, seed.ny),
        };
        let image = system.extended_map(initial, orbit.period)?;
        maximum_residual = maximum_residual.max(state_error(initial, image));
    }

    let tolerance = 1e-7;
    Ok(ValidationCase {
        id: "periodic_orbit_residual",
        passed: maximum_residual <= tolerance,
        metric: maximum_residual,
        tolerance,
        explanation: format!(
            "Maximum 4D period residual across {} reference orbit(s).",
            analysis.orbit_database.total_count()
        ),
    })
}

fn validate_reduced_boundary_multipliers() -> Result<ValidationCase, String> {
    let bounds = PhaseSpaceBounds::try_new(-2.0, 2.0, -1.5, 1.5)?;
    let search = PeriodicSearchConfig::try_new(2, 8, 8, 1e-9)?;
    let analysis = BoundaryHenonSystemAnalysis::from_config(0.4, 0.3, 0.0625, bounds, search)?;
    let system = HenonSystem::new(0.4, 0.3, 0.0625);
    let mut maximum_relation_residual = 0.0_f64;
    let mut checked = 0_usize;
    for orbit in &analysis.orbit_database.orbits {
        let Some(seed) = orbit.extended_points.first() else {
            continue;
        };
        let diagnostics = reduced_periodic_diagnostics(&system, *seed, orbit.period)?;
        if diagnostics.multiplier_magnitudes.len() != 3 {
            return Err("Reduced boundary monodromy did not return three multipliers".to_string());
        }
        maximum_relation_residual =
            maximum_relation_residual.max(diagnostics.multiplier_relation_residual);
        checked += 1;
    }
    if checked == 0 {
        return Err(
            "No periodic states were available for reduced multiplier validation".to_string(),
        );
    }
    let tolerance = 2e-5;
    Ok(ValidationCase {
        id: "wei_reduced_multiplier_identity",
        passed: maximum_relation_residual <= tolerance,
        metric: maximum_relation_residual,
        tolerance,
        explanation: format!(
            "Maximum residual of lambda_+ lambda_- = lambda_1 across {checked} reduced 3D boundary-map monodromies."
        ),
    })
}

fn validate_wei_wedge_threshold() -> ValidationCase {
    let threshold = wedge_curvature_threshold(0.0625).expect("positive reference epsilon");
    let error = (threshold - 16.0).abs();
    ValidationCase {
        id: "wei_wedge_curvature_threshold",
        passed: error <= f64::EPSILON,
        metric: error,
        tolerance: f64::EPSILON,
        explanation:
            "Absolute error in the thesis wedge threshold 1/epsilon = 16 for epsilon = 0.0625."
                .to_string(),
    }
}

fn integrate_duffing(
    ode: &DuffingODE,
    initial: Vector2<f64>,
    step: f64,
    count: usize,
) -> Vector2<f64> {
    (0..count).fold(initial, |state, _| {
        ode.rk4_step(state, step)
            .expect("finite Duffing validation trajectory")
    })
}

fn validate_rk4_convergence() -> ValidationCase {
    let ode = DuffingODE::new(0.15).expect("valid damping");
    let initial = Vector2::new(0.1, 0.1);
    let interval = 0.2;
    let reference = integrate_duffing(&ode, initial, interval / 64.0, 64);
    let coarse = integrate_duffing(&ode, initial, interval, 1);
    let refined = integrate_duffing(&ode, initial, interval / 2.0, 2);
    let coarse_error = (coarse - reference).norm();
    let refined_error = (refined - reference).norm();
    let observed_ratio = coarse_error / refined_error.max(f64::EPSILON);
    let minimum_ratio = 8.0;

    ValidationCase {
        id: "duffing_rk4_refinement",
        passed: refined_error < coarse_error && observed_ratio >= minimum_ratio,
        metric: observed_ratio,
        tolerance: minimum_ratio,
        explanation: "Observed error-reduction ratio when the RK4 step is halved; fourth-order behavior approaches 16."
            .to_string(),
    }
}

fn validate_ulam_probability_invariants() -> Result<ValidationCase, String> {
    // Peschke's Hénon domain is chosen so the epsilon-inflated image remains
    // inside the state space for the investigated parameter interval.
    let computer = UlamComputer::new(0.4, 0.3, 16, 16, 0.0625, -2.2, 2.2, -1.1, 1.1)?;
    let measure = computer.invariant_measure();
    let mass_error = (measure.iter().sum::<f64>() - 1.0).abs();
    let minimum = measure.iter().copied().fold(f64::INFINITY, f64::min);
    let maximum_row_error = (0..measure.len())
        .filter_map(|index| {
            let row = computer.transition_probabilities(index);
            (!row.is_empty())
                .then(|| (row.iter().map(|(_, probability)| probability).sum::<f64>() - 1.0).abs())
        })
        .fold(0.0_f64, f64::max);
    let absorption = computer.absorption_probabilities();
    let absorption_range_error = absorption
        .iter()
        .map(|value| (-value).max(value - 1.0).max(0.0))
        .fold(0.0_f64, f64::max);
    let absorption_residual = absorption
        .iter()
        .enumerate()
        .map(|(from, value)| {
            let image = computer
                .transition_probabilities(from)
                .iter()
                .map(|(to, probability)| probability * absorption[*to])
                .sum::<f64>();
            (image - value).abs()
        })
        .fold(0.0_f64, f64::max);
    let metric = mass_error
        .max(maximum_row_error)
        .max((-minimum).max(0.0))
        .max(absorption_range_error)
        .max(absorption_residual);
    let tolerance = 1e-10;

    Ok(ValidationCase {
        id: "ulam_probability_invariants",
        passed: metric <= tolerance,
        metric,
        tolerance,
        explanation: "Maximum violation of stationary-mass normalization, row-stochasticity, non-negativity, the absorption range [0,1], and P alpha = alpha."
            .to_string(),
    })
}

pub fn run_scientific_validation() -> Result<ValidationReport, String> {
    let cases = vec![
        validate_analytic_henon_fixed_point(),
        validate_extended_map_roundtrip(),
        validate_periodic_orbit_residuals()?,
        validate_reduced_boundary_multipliers()?,
        validate_wei_wedge_threshold(),
        validate_rk4_convergence(),
        validate_ulam_probability_invariants()?,
    ];
    Ok(ValidationReport {
        software: "Bounded Invariant Set Toolbox",
        version: env!("CARGO_PKG_VERSION"),
        passed: cases.iter().all(|case| case.passed),
        cases,
    })
}
