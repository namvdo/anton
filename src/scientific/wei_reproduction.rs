//! Reproduction harness for the extended Hénon boundary-map results.

use std::collections::BTreeMap;

use nalgebra::Vector2;
use serde::Serialize;

use crate::boundary_map::curvature::wedge_curvature_threshold;
use crate::boundary_periodic::{
    continue_henon_orbits_from_previous, database_to_found_orbits_generic,
    reduced_periodic_diagnostics, BoundaryHenonSystemAnalysis, PeriodicSearchConfig, StabilityType,
};
use crate::dynamical_systems::{DynamicalSystem, ExtendedState, HenonSystem};
use crate::range::PhaseSpaceBounds;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReproductionProfile {
    Smoke,
    Reference,
}

#[derive(Clone, Debug, Serialize)]
pub struct OrbitCheckpoint {
    pub a: f64,
    pub b: f64,
    pub epsilon: f64,
    pub search_max_period: usize,
    pub orbit_count: usize,
    pub orbit_count_by_period: BTreeMap<usize, usize>,
    pub orbit_count_by_period_and_stability: BTreeMap<String, usize>,
    pub maximum_period_residual: f64,
    pub maximum_multiplier_relation_residual: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct TheoryCheck {
    pub id: &'static str,
    pub value: f64,
    pub expected: f64,
    pub absolute_error: f64,
    pub tolerance: f64,
    pub passed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ContinuationCheck {
    pub id: &'static str,
    pub source_a: f64,
    pub target_a: f64,
    pub expected_period_two_points: usize,
    pub observed_period_two_points: usize,
    pub observed_saddle_points: usize,
    pub observed_stable_points: usize,
    pub passed: bool,
    pub explanation: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct WeiReproductionReport {
    pub software_version: &'static str,
    pub profile: &'static str,
    pub map: &'static str,
    pub theory_checks: Vec<TheoryCheck>,
    pub orbit_checkpoints: Vec<OrbitCheckpoint>,
    pub continuation_checks: Vec<ContinuationCheck>,
    pub passed: bool,
    pub scope_note: &'static str,
}

fn map_residual(
    system: &HenonSystem,
    point: crate::ExtendedPoint,
    period: usize,
) -> Result<f64, String> {
    let initial = ExtendedState {
        pos: Vector2::new(point.x, point.y),
        normal: Vector2::new(point.nx, point.ny),
    };
    let image = system.extended_map(initial, period)?;
    Ok((image.pos - initial.pos)
        .norm()
        .hypot((image.normal - initial.normal).norm()))
}

fn orbit_checkpoint(a: f64, profile: ReproductionProfile) -> Result<OrbitCheckpoint, String> {
    let (grid_size, theta_grid_size) = match profile {
        ReproductionProfile::Smoke => (10, 10),
        ReproductionProfile::Reference => (18, 18),
    };
    let b = 0.3;
    let epsilon = 0.0625;
    let search_max_period = 2;
    let bounds = PhaseSpaceBounds::try_new(-1.2, 2.1, -1.1, 1.3)?;
    let search =
        PeriodicSearchConfig::try_new(search_max_period, grid_size, theta_grid_size, 1e-10)?;
    let analysis = BoundaryHenonSystemAnalysis::from_config(a, b, epsilon, bounds, search)?;
    let system = HenonSystem::new(a, b, epsilon);
    let mut orbit_count_by_period = BTreeMap::new();
    let mut orbit_count_by_period_and_stability = BTreeMap::new();
    let mut maximum_period_residual = 0.0_f64;
    let mut maximum_multiplier_relation_residual = 0.0_f64;

    for orbit in &analysis.orbit_database.orbits {
        *orbit_count_by_period.entry(orbit.period).or_insert(0) += 1;
        *orbit_count_by_period_and_stability
            .entry(format!("period_{}_{:?}", orbit.period, orbit.stability).to_lowercase())
            .or_insert(0) += 1;
        let seed = *orbit
            .extended_points
            .first()
            .ok_or_else(|| "Periodic orbit contains no extended point".to_string())?;
        maximum_period_residual =
            maximum_period_residual.max(map_residual(&system, seed, orbit.period)?);
        maximum_multiplier_relation_residual = maximum_multiplier_relation_residual.max(
            reduced_periodic_diagnostics(&system, seed, orbit.period)?.multiplier_relation_residual,
        );
    }

    Ok(OrbitCheckpoint {
        a,
        b,
        epsilon,
        search_max_period,
        orbit_count: analysis.orbit_database.total_count(),
        orbit_count_by_period,
        orbit_count_by_period_and_stability,
        maximum_period_residual,
        maximum_multiplier_relation_residual,
    })
}

fn splitting_continuation_check(profile: ReproductionProfile) -> Result<ContinuationCheck, String> {
    let (grid_size, theta_grid_size) = match profile {
        ReproductionProfile::Smoke => (18, 18),
        ReproductionProfile::Reference => (22, 22),
    };
    let bounds = PhaseSpaceBounds::try_new(-1.2, 2.1, -1.1, 1.3)?;
    let search = PeriodicSearchConfig::try_new(2, grid_size, theta_grid_size, 1e-10)?;
    let source = BoundaryHenonSystemAnalysis::from_config(0.63, 0.3, 0.0625, bounds, search)?;
    let seeds = database_to_found_orbits_generic(&source.orbit_database);
    let continued =
        continue_henon_orbits_from_previous(&seeds, 0.63, 0.3, 0.0625, 0.6, 0.3, 0.0625, 2, 1e-10);
    let observed_saddle_points: usize = continued
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2 && orbit.stability == StabilityType::Saddle)
        .map(|orbit| orbit.extended_points.len())
        .sum();
    let observed_stable_points: usize = continued
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2 && orbit.stability == StabilityType::Stable)
        .map(|orbit| orbit.extended_points.len())
        .sum();
    let observed_period_two_points = observed_saddle_points + observed_stable_points;
    let expected_period_two_points = 4;
    Ok(ContinuationCheck {
        id: "four_period_two_points_after_splitting",
        source_a: 0.63,
        target_a: 0.6,
        expected_period_two_points,
        observed_period_two_points,
        observed_saddle_points,
        observed_stable_points,
        passed: observed_period_two_points == expected_period_two_points,
        explanation: "Two period-two branches are searched at a=0.63 and continued backward to a=0.6 so the near-saddle-node branch is not lost by a cold grid search. The reduced spectrum gives two saddle points and two stable points; this agrees with the red/green convention in Figure 6.6 but not with the phrase '4 saddle periodic points' on page 98.",
    })
}

pub fn run_wei_reproduction(profile: ReproductionProfile) -> Result<WeiReproductionReport, String> {
    let wedge = wedge_curvature_threshold(0.0625)?;
    let theory_checks = vec![TheoryCheck {
        id: "wedge_threshold_epsilon_0_0625",
        value: wedge,
        expected: 16.0,
        absolute_error: (wedge - 16.0).abs(),
        tolerance: f64::EPSILON,
        passed: (wedge - 16.0).abs() <= f64::EPSILON,
    }];

    // The checkpoints surround the splitting event and the point at which the
    // period-two branch ceases to represent the MIS normal bundle. Orbit search
    // alone does not decide normal-bundle membership; that requires the
    // manifold and set-oriented cross-check recorded in the target ledger.
    let orbit_checkpoints = [0.4, 0.59, 0.6, 0.605, 0.63]
        .into_iter()
        .map(|a| orbit_checkpoint(a, profile))
        .collect::<Result<Vec<_>, _>>()?;
    let continuation_checks = vec![splitting_continuation_check(profile)?];
    let numerical_pass = orbit_checkpoints.iter().all(|checkpoint| {
        checkpoint.orbit_count > 0
            && checkpoint.maximum_period_residual <= 1e-7
            && checkpoint.maximum_multiplier_relation_residual <= 2e-5
    });
    let passed = theory_checks.iter().all(|check| check.passed)
        && continuation_checks.iter().all(|check| check.passed)
        && numerical_pass;

    Ok(WeiReproductionReport {
        software_version: env!("CARGO_PKG_VERSION"),
        profile: match profile {
            ReproductionProfile::Smoke => "smoke",
            ReproductionProfile::Reference => "reference",
        },
        map: "E(x,n)=(H_{a,b}(x)+epsilon*n_1,n_1), n_1=normalize((D H_{a,b}(x)^T)^(-1)n)",
        theory_checks,
        orbit_checkpoints,
        continuation_checks,
        passed,
        scope_note: "This report verifies the extended-map orbit equations and reduced multipliers. Topological conclusions require the separate manifold/MIS/dual-repeller acceptance criteria in validation/wei_thesis_targets.json.",
    })
}
