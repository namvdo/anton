//! Multi-grid evidence workflow for Wei's Hénon MIS-splitting target.
//!
//! The finite-state MIS diagnostic uses terminal strongly connected classes,
//! not connected components of a thresholded stationary density. The latter
//! can split a single periodically cycling class into visually disjoint lobes.

use std::time::{SystemTime, UNIX_EPOCH};

use nalgebra::Vector2;
use serde::Serialize;

use crate::boundary_periodic::{
    continue_henon_orbits_from_previous, database_to_found_orbits_generic,
    BoundaryHenonSystemAnalysis, PeriodicOrbitDatabase, PeriodicSearchConfig, StabilityType,
};
use crate::dynamical_systems::{DynamicalSystem, ExtendedState, HenonSystem};
use crate::range::PhaseSpaceBounds;
use crate::set_oriented::topology::{
    boundary_mask, component_count, terminal_strongly_connected_components, threshold_dual_repeller,
};
use crate::ulam::{Grid, UlamComputer};
use crate::{HenonParams, ManifoldConfig, SaddlePoint, SaddleType, UnstableManifoldComputer};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RefinementProfile {
    Smoke,
    Reference,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefinementConfig {
    pub a_values: Vec<f64>,
    pub grid_dimensions: Vec<(usize, usize)>,
    pub b: f64,
    pub epsilon: f64,
    pub domain: [f64; 4],
    pub points_per_box: usize,
    pub periodic_continuation_source_a: f64,
    pub periodic_search_grid_size: usize,
    pub periodic_residual_tolerance: f64,
    pub dual_deficit_thresholds: Vec<f64>,
    pub primary_dual_deficit_threshold: f64,
    pub contact_distance_box_diagonals: f64,
    pub absorption_max_iterations: usize,
    pub absorption_tolerance: f64,
    pub manifold_spacing_tolerance: f64,
    pub manifold_max_iterations: usize,
    pub manifold_max_points: usize,
    pub manifold_time_limit_seconds: f64,
    pub manifold_distance_limit_box_units: f64,
}

impl RefinementConfig {
    pub fn for_profile(profile: RefinementProfile) -> Self {
        Self {
            a_values: vec![0.59, 0.595, 0.6],
            grid_dimensions: match profile {
                RefinementProfile::Smoke => vec![(48, 24), (64, 32)],
                RefinementProfile::Reference => vec![(96, 48), (128, 64), (160, 80)],
            },
            b: 0.3,
            epsilon: 0.0625,
            domain: [-2.2, 2.2, -1.1, 1.1],
            points_per_box: 4,
            periodic_continuation_source_a: 0.63,
            periodic_search_grid_size: match profile {
                RefinementProfile::Smoke => 18,
                RefinementProfile::Reference => 22,
            },
            periodic_residual_tolerance: 1e-10,
            dual_deficit_thresholds: vec![0.1, 0.25],
            primary_dual_deficit_threshold: 0.25,
            contact_distance_box_diagonals: 1.0,
            absorption_max_iterations: 2_000,
            absorption_tolerance: 1e-10,
            manifold_spacing_tolerance: 0.01,
            manifold_max_iterations: 200,
            manifold_max_points: 100_000,
            manifold_time_limit_seconds: 30.0,
            manifold_distance_limit_box_units: 2.0,
        }
    }

    fn validate(&self) -> Result<(), String> {
        if self.a_values.len() < 3
            || self.a_values.windows(2).any(|pair| pair[0] >= pair[1])
            || self.a_values.iter().any(|value| !value.is_finite())
        {
            return Err(
                "Refinement requires at least three increasing finite a values".to_string(),
            );
        }
        if self.grid_dimensions.len() < 2
            || self
                .grid_dimensions
                .iter()
                .any(|dims| dims.0 == 0 || dims.1 == 0)
            || self
                .grid_dimensions
                .windows(2)
                .any(|pair| pair[0].0 >= pair[1].0 || pair[0].1 >= pair[1].1)
        {
            return Err(
                "Refinement requires at least two grids increasing in both dimensions".to_string(),
            );
        }
        if self.points_per_box == 0 {
            return Err("pointsPerBox must be positive".to_string());
        }
        if !self.periodic_continuation_source_a.is_finite()
            || self.periodic_search_grid_size < 2
            || !self.periodic_residual_tolerance.is_finite()
            || self.periodic_residual_tolerance <= 0.0
        {
            return Err("Periodic continuation settings must be positive and finite".to_string());
        }
        if !self.b.is_finite() || self.b.abs() < 1e-10 {
            return Err("Hénon b must be finite and nonzero".to_string());
        }
        if !self.epsilon.is_finite() || self.epsilon <= 0.0 {
            return Err("Noise radius must be positive and finite".to_string());
        }
        if self.domain.iter().any(|value| !value.is_finite())
            || self.domain[0] >= self.domain[1]
            || self.domain[2] >= self.domain[3]
        {
            return Err("Domain bounds must be finite and strictly ordered".to_string());
        }
        if self.dual_deficit_thresholds.is_empty()
            || self
                .dual_deficit_thresholds
                .iter()
                .any(|value| !value.is_finite() || !(0.0..1.0).contains(value))
            || !self
                .dual_deficit_thresholds
                .contains(&self.primary_dual_deficit_threshold)
        {
            return Err(
                "Dual thresholds must lie in [0,1), including the primary threshold".to_string(),
            );
        }
        if !self.contact_distance_box_diagonals.is_finite()
            || self.contact_distance_box_diagonals <= 0.0
        {
            return Err("Contact distance must be positive and finite".to_string());
        }
        if self.absorption_max_iterations == 0
            || !self.absorption_tolerance.is_finite()
            || self.absorption_tolerance <= 0.0
        {
            return Err("Absorption iteration settings must be positive and finite".to_string());
        }
        if !self.manifold_spacing_tolerance.is_finite()
            || self.manifold_spacing_tolerance <= 0.0
            || self.manifold_max_iterations == 0
            || self.manifold_max_points == 0
            || !self.manifold_time_limit_seconds.is_finite()
            || self.manifold_time_limit_seconds <= 0.0
        {
            return Err("Manifold sampling settings must be positive and finite".to_string());
        }
        if !self.manifold_distance_limit_box_units.is_finite()
            || self.manifold_distance_limit_box_units <= 0.0
        {
            return Err("Manifold distance limit must be positive and finite".to_string());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactThresholdResult {
    pub deficit_threshold: f64,
    pub contact_clusters: usize,
    pub contact_boxes: usize,
    pub minimum_separation_box_units: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefinementRow {
    pub a: f64,
    pub grid: (usize, usize),
    pub box_width: f64,
    pub box_height: f64,
    pub period_two_points: usize,
    pub period_two_stable_points: usize,
    pub period_two_saddle_points: usize,
    pub maximum_period_two_residual: Option<f64>,
    pub mis_count: usize,
    pub expected_mis_count: usize,
    pub mis_count_matches_expected: bool,
    pub mis_spatial_components: usize,
    pub mis_box_count: usize,
    pub contact_thresholds: Vec<ContactThresholdResult>,
    pub dual_contact_clusters: usize,
    pub dual_contact_count_stable_across_thresholds: bool,
    pub minimum_dual_separation_box_units: Option<f64>,
    pub maximum_absorption_residual: f64,
    pub manifold_point_count: usize,
    pub manifold_to_mis_boundary_p95: Option<f64>,
    pub manifold_to_mis_boundary_p95_box_units: Option<f64>,
    pub mis_boundary_to_manifold_p95: Option<f64>,
    pub mis_boundary_to_manifold_p95_box_units: Option<f64>,
    pub two_contact_signature_passes: Option<bool>,
    pub manifold_comparison_passes: Option<bool>,
    pub row_supports_requested_signature: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AssessmentStatus {
    Supported,
    NotSupported,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimAssessment {
    pub id: &'static str,
    pub status: AssessmentStatus,
    pub evidence: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeiRefinementBundle {
    pub schema: &'static str,
    pub schema_version: u32,
    pub software_version: &'static str,
    pub profile: &'static str,
    pub generated_unix_seconds: u64,
    pub model: &'static str,
    pub noise_geometry: &'static str,
    pub mis_estimator: &'static str,
    pub config: RefinementConfig,
    pub rows: Vec<RefinementRow>,
    pub assessments: Vec<ClaimAssessment>,
    pub accepted: bool,
    pub scope_note: &'static str,
}

impl WeiRefinementBundle {
    pub fn acceptance_table_csv(&self) -> String {
        let mut table = String::from(
            "a,grid_x,grid_y,box_width,box_height,period_two_points,period_two_stable_points,period_two_saddle_points,mis_count,expected_mis_count,mis_count_pass,mis_spatial_components,mis_boxes,dual_contact_clusters,contact_count_threshold_stable,min_dual_separation_box_units,absorption_residual,manifold_points,manifold_to_boundary_p95_box_units,boundary_to_manifold_p95_box_units,two_contact_pass,manifold_comparison_pass,row_signature_pass\n",
        );
        for row in &self.rows {
            table.push_str(&format!(
                "{:.8},{},{},{:.10},{:.10},{},{},{},{},{},{},{},{},{},{},{},{:.3e},{},{},{},{},{},{}\n",
                row.a,
                row.grid.0,
                row.grid.1,
                row.box_width,
                row.box_height,
                row.period_two_points,
                row.period_two_stable_points,
                row.period_two_saddle_points,
                row.mis_count,
                row.expected_mis_count,
                row.mis_count_matches_expected,
                row.mis_spatial_components,
                row.mis_box_count,
                row.dual_contact_clusters,
                row.dual_contact_count_stable_across_thresholds,
                csv_option(row.minimum_dual_separation_box_units),
                row.maximum_absorption_residual,
                row.manifold_point_count,
                csv_option(row.manifold_to_mis_boundary_p95_box_units),
                csv_option(row.mis_boundary_to_manifold_p95_box_units),
                csv_bool_option(row.two_contact_signature_passes),
                csv_bool_option(row.manifold_comparison_passes),
                row.row_supports_requested_signature,
            ));
        }
        table
    }
}

fn csv_option(value: Option<f64>) -> String {
    value
        .map(|number| format!("{number:.8}"))
        .unwrap_or_default()
}

fn csv_bool_option(value: Option<bool>) -> &'static str {
    match value {
        Some(true) => "true",
        Some(false) => "false",
        None => "",
    }
}

#[derive(Clone, Debug)]
struct AbsorptionResult {
    probabilities: Vec<f64>,
    residual: f64,
}

fn support_absorption(
    ulam: &UlamComputer,
    support: &[bool],
    max_iterations: usize,
    tolerance: f64,
) -> Result<AbsorptionResult, String> {
    let size = ulam.grid().boxes.len();
    if support.len() != size || !support.iter().any(|included| *included) {
        return Err("Absorption support must select at least one grid box".to_string());
    }
    let mut alpha: Vec<f64> = support
        .iter()
        .map(|included| if *included { 1.0 } else { 0.0 })
        .collect();
    let mut next = vec![0.0; size];
    for _ in 0..max_iterations {
        for (source, next_value) in next.iter_mut().enumerate() {
            *next_value = ulam
                .transition_probabilities(source)
                .iter()
                .map(|(target, probability)| probability * alpha[*target])
                .sum::<f64>()
                .clamp(0.0, 1.0);
        }
        let residual = next
            .iter()
            .zip(&alpha)
            .map(|(new, old)| (new - old).abs())
            .fold(0.0, f64::max);
        alpha.copy_from_slice(&next);
        if residual <= tolerance {
            return Ok(AbsorptionResult {
                probabilities: alpha,
                residual,
            });
        }
    }
    Err(format!(
        "Support absorption did not converge within {max_iterations} iterations"
    ))
}

fn transition_adjacency(ulam: &UlamComputer) -> Vec<Vec<usize>> {
    (0..ulam.grid().boxes.len())
        .map(|source| {
            ulam.transition_probabilities(source)
                .iter()
                .map(|(target, _)| *target)
                .collect()
        })
        .collect()
}

fn mask_for_members(size: usize, members: &[usize]) -> Vec<bool> {
    let mut mask = vec![false; size];
    for &member in members {
        mask[member] = true;
    }
    mask
}

fn union_masks(masks: &[Vec<bool>], size: usize) -> Vec<bool> {
    let mut union = vec![false; size];
    for mask in masks {
        for (target, included) in union.iter_mut().zip(mask) {
            *target |= *included;
        }
    }
    union
}

fn box_separation(left: usize, right: usize, grid: &Grid) -> f64 {
    let a = &grid.boxes[left];
    let b = &grid.boxes[right];
    let dx = ((a.center.0 - b.center.0).abs() - a.radius.0 - b.radius.0).max(0.0);
    let dy = ((a.center.1 - b.center.1).abs() - a.radius.1 - b.radius.1).max(0.0);
    dx.hypot(dy)
}

fn contact_result(
    mis_masks: &[Vec<bool>],
    absorptions: &[AbsorptionResult],
    threshold: f64,
    contact_distance_box_diagonals: f64,
    grid: &Grid,
) -> Result<ContactThresholdResult, String> {
    let size = grid.boxes.len();
    let diagonal = grid.step.x.hypot(grid.step.y);
    let mut contact_mask = vec![false; size];
    let mut minimum = f64::INFINITY;
    for (mis, absorption) in mis_masks.iter().zip(absorptions) {
        let boundary = boundary_mask(mis, grid.dims)?;
        let dual = threshold_dual_repeller(&absorption.probabilities, threshold)?;
        let dual_indices: Vec<_> = dual
            .iter()
            .enumerate()
            .filter_map(|(index, included)| included.then_some(index))
            .collect();
        for (mis_index, on_boundary) in boundary.iter().copied().enumerate() {
            if !on_boundary || dual_indices.is_empty() {
                continue;
            }
            let separation = dual_indices
                .iter()
                .map(|dual_index| box_separation(mis_index, *dual_index, grid))
                .fold(f64::INFINITY, f64::min);
            minimum = minimum.min(separation);
            if separation <= contact_distance_box_diagonals * diagonal {
                contact_mask[mis_index] = true;
            }
        }
    }
    Ok(ContactThresholdResult {
        deficit_threshold: threshold,
        contact_clusters: component_count(&contact_mask, grid.dims)?,
        contact_boxes: contact_mask.iter().filter(|included| **included).count(),
        minimum_separation_box_units: minimum.is_finite().then_some(minimum / diagonal),
    })
}

fn period_residual(
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

fn period_two_summary(
    database: &PeriodicOrbitDatabase,
    system: &HenonSystem,
) -> Result<(usize, usize, usize, Option<f64>), String> {
    let stable: usize = database
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2 && orbit.stability == StabilityType::Stable)
        .map(|orbit| orbit.extended_points.len())
        .sum();
    let saddle: usize = database
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2 && orbit.stability == StabilityType::Saddle)
        .map(|orbit| orbit.extended_points.len())
        .sum();
    let residuals = database
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2)
        .flat_map(|orbit| {
            orbit
                .extended_points
                .first()
                .map(|point| (*point, orbit.period))
        })
        .map(|(point, period)| period_residual(system, point, period))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((
        stable + saddle,
        stable,
        saddle,
        residuals.into_iter().reduce(f64::max),
    ))
}

fn candidate_manifold_projection(
    database: &PeriodicOrbitDatabase,
    config: &RefinementConfig,
    a: f64,
) -> Result<Vec<Vector2<f64>>, String> {
    let params = HenonParams::new(a, config.b, config.epsilon)?;
    let manifold_config = ManifoldConfig {
        spacing_tol: config.manifold_spacing_tolerance,
        max_iter: config.manifold_max_iterations,
        max_points: config.manifold_max_points,
        time_limit: config.manifold_time_limit_seconds,
        ..ManifoldConfig::default()
    };
    let computer = UnstableManifoldComputer::new(params, manifold_config);
    let mut projection = Vec::new();
    for orbit in database
        .orbits
        .iter()
        .filter(|orbit| orbit.period == 2 && orbit.stability == StabilityType::Saddle)
    {
        let eigenvalue = orbit
            .eigenvalues
            .iter()
            .copied()
            .filter(|value| value.is_finite())
            .fold(0.0, f64::max);
        if eigenvalue <= 1.0 {
            return Err("Period-two saddle lacks an expanding reduced multiplier".to_string());
        }
        for point in &orbit.extended_points {
            let normal = Vector2::new(point.nx, point.ny);
            let normal_length = normal.norm();
            if !normal_length.is_finite() || normal_length <= 1e-12 {
                return Err("Period-two saddle has an invalid normal".to_string());
            }
            let normal = normal / normal_length;
            let saddle = SaddlePoint {
                position: Vector2::new(point.x, point.y),
                period: orbit.period,
                tangent_2d: Vector2::new(-normal.y, normal.x),
                eigenvalue,
                tangent_4d: None,
                saddle_type: SaddleType::Regular,
                normal,
            };
            let (plus, minus) = computer.compute_manifold(&saddle, &[])?;
            projection.extend(plus.points.into_iter().map(|state| state.pos));
            projection.extend(minus.points.into_iter().map(|state| state.pos));
        }
    }
    projection.retain(|point| {
        point.x.is_finite()
            && point.y.is_finite()
            && (config.domain[0]..=config.domain[1]).contains(&point.x)
            && (config.domain[2]..=config.domain[3]).contains(&point.y)
    });
    Ok(projection)
}

fn percentile_95(mut values: Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    Some(values[((values.len() - 1) as f64 * 0.95).ceil() as usize])
}

fn manifold_comparison(
    manifold: &[Vector2<f64>],
    mis_boundary: &[bool],
    grid: &Grid,
) -> (Option<f64>, Option<f64>) {
    if manifold.is_empty() {
        return (None, None);
    }
    let boundary_points: Vec<_> = mis_boundary
        .iter()
        .enumerate()
        .filter(|(_, included)| **included)
        .map(|(index, _)| {
            let center = grid.boxes[index].center;
            Vector2::new(center.0, center.1)
        })
        .collect();
    if boundary_points.is_empty() {
        return (None, None);
    }
    let manifold_to_boundary = manifold
        .iter()
        .map(|point| {
            boundary_points
                .iter()
                .map(|boundary| (point - boundary).norm())
                .fold(f64::INFINITY, f64::min)
        })
        .collect();
    let boundary_to_manifold = boundary_points
        .iter()
        .map(|boundary| {
            manifold
                .iter()
                .map(|point| (boundary - point).norm())
                .fold(f64::INFINITY, f64::min)
        })
        .collect();
    (
        percentile_95(manifold_to_boundary),
        percentile_95(boundary_to_manifold),
    )
}

fn build_assessments(config: &RefinementConfig, rows: &[RefinementRow]) -> Vec<ClaimAssessment> {
    let before = config.a_values[0];
    let target = config.a_values[config.a_values.len() / 2];
    let after = *config.a_values.last().expect("validated nonempty a values");
    let finest_count = config.grid_dimensions.len().min(2);
    let finest = &config.grid_dimensions[config.grid_dimensions.len() - finest_count..];
    let select = |a: f64| {
        rows.iter()
            .filter(|row| row.a == a && finest.contains(&row.grid))
            .collect::<Vec<_>>()
    };
    let before_rows = select(before);
    let target_rows = select(target);
    let after_rows = select(after);

    let local_supported = before_rows.iter().all(|row| {
        row.period_two_points == 2
            && row.period_two_stable_points == 2
            && row.period_two_saddle_points == 0
    }) && after_rows.iter().all(|row| {
        row.period_two_points == 4
            && row.period_two_stable_points == 2
            && row.period_two_saddle_points == 2
            && row.maximum_period_two_residual.unwrap_or(f64::INFINITY) <= 1e-7
    });
    let components_supported = before_rows.iter().all(|row| row.mis_count == 1)
        && after_rows.iter().all(|row| row.mis_count == 2);
    let contacts_supported = target_rows.iter().all(|row| {
        row.dual_contact_clusters == 2 && row.dual_contact_count_stable_across_thresholds
    });
    let manifold_supported = after_rows.iter().all(|row| {
        row.manifold_to_mis_boundary_p95_box_units
            .is_some_and(|value| value <= config.manifold_distance_limit_box_units)
            && row
                .mis_boundary_to_manifold_p95_box_units
                .is_some_and(|value| value <= config.manifold_distance_limit_box_units)
    });
    let topological_supported =
        local_supported && components_supported && contacts_supported && manifold_supported;

    vec![
        ClaimAssessment {
            id: "continued_period_two_saddle_node_signature",
            status: status(local_supported),
            evidence: format!(
                "At a={before}, the finest-grid rows report {:?} period-two points; at a={after}, they report {:?}.",
                before_rows
                    .iter()
                    .map(|row| row.period_two_points)
                    .collect::<Vec<_>>(),
                after_rows
                    .iter()
                    .map(|row| row.period_two_points)
                    .collect::<Vec<_>>()
            ),
        },
        ClaimAssessment {
            id: "refinement_stable_mis_split",
            status: status(components_supported),
            evidence: format!(
                "Terminal-class MIS counts on the finest grids are {:?} before and {:?} after the target.",
                before_rows.iter().map(|row| row.mis_count).collect::<Vec<_>>(),
                after_rows.iter().map(|row| row.mis_count).collect::<Vec<_>>()
            ),
        },
        ClaimAssessment {
            id: "two_dual_repeller_contacts",
            status: status(contacts_supported),
            evidence: format!(
                "At a={target}, primary-threshold contact-cluster counts on the finest grids are {:?}; threshold stability is {:?}.",
                target_rows
                    .iter()
                    .map(|row| row.dual_contact_clusters)
                    .collect::<Vec<_>>(),
                target_rows
                    .iter()
                    .map(|row| row.dual_contact_count_stable_across_thresholds)
                    .collect::<Vec<_>>()
            ),
        },
        ClaimAssessment {
            id: "period_two_manifold_matches_mis_boundary",
            status: status(manifold_supported),
            evidence: format!(
                "At a={after}, directed 95th-percentile distances in box-diagonal units are {:?} (manifold to boundary) and {:?} (boundary to manifold).",
                after_rows
                    .iter()
                    .map(|row| row.manifold_to_mis_boundary_p95_box_units)
                    .collect::<Vec<_>>(),
                after_rows
                    .iter()
                    .map(|row| row.mis_boundary_to_manifold_p95_box_units)
                    .collect::<Vec<_>>()
            ),
        },
        ClaimAssessment {
            id: "wei_mis_split_near_a_0_595",
            status: status(topological_supported),
            evidence: "Accepted only when the continued local branch, terminal-class change, two dual contacts, and bidirectional manifold comparison all pass on the finest grids."
                .to_string(),
        },
    ]
}

fn status(supported: bool) -> AssessmentStatus {
    if supported {
        AssessmentStatus::Supported
    } else {
        AssessmentStatus::NotSupported
    }
}

pub fn run_wei_split_refinement(profile: RefinementProfile) -> Result<WeiRefinementBundle, String> {
    let config = RefinementConfig::for_profile(profile);
    run_wei_split_refinement_with_config(profile, config)
}

pub fn run_wei_split_refinement_with_config(
    profile: RefinementProfile,
    config: RefinementConfig,
) -> Result<WeiRefinementBundle, String> {
    config.validate()?;
    let periodic_bounds = PhaseSpaceBounds::try_new(-1.2, 2.1, -1.1, 1.3)?;
    let periodic_search = PeriodicSearchConfig::try_new(
        2,
        config.periodic_search_grid_size,
        config.periodic_search_grid_size,
        config.periodic_residual_tolerance,
    )?;
    let continuation_source = BoundaryHenonSystemAnalysis::from_config(
        config.periodic_continuation_source_a,
        config.b,
        config.epsilon,
        periodic_bounds,
        periodic_search,
    )?;
    let continuation_seeds = database_to_found_orbits_generic(&continuation_source.orbit_database);
    if continuation_seeds.is_empty() {
        return Err("Continuation source produced no periodic seeds".to_string());
    }

    let mut rows = Vec::new();
    let target_a = config.a_values[config.a_values.len() / 2];
    for &a in &config.a_values {
        let periodic = continue_henon_orbits_from_previous(
            &continuation_seeds,
            config.periodic_continuation_source_a,
            config.b,
            config.epsilon,
            a,
            config.b,
            config.epsilon,
            2,
            config.periodic_residual_tolerance,
        );
        let system = HenonSystem::new(a, config.b, config.epsilon);
        let (period_two_points, period_two_stable_points, period_two_saddle_points, residual) =
            period_two_summary(&periodic, &system)?;
        let manifold = candidate_manifold_projection(&periodic, &config, a)?;

        for &dims in &config.grid_dimensions {
            let ulam = UlamComputer::try_new_rectangular(
                a,
                config.b,
                dims,
                config.points_per_box,
                config.epsilon,
                Vector2::new(config.domain[0], config.domain[2]),
                Vector2::new(config.domain[1], config.domain[3]),
            )?;
            let adjacency = transition_adjacency(&ulam);
            let terminal = terminal_strongly_connected_components(&adjacency)?;
            if terminal.is_empty() {
                return Err(format!(
                    "No closed transition class at a={a}, grid={}x{}; enlarge the domain",
                    dims.0, dims.1
                ));
            }
            let mis_masks: Vec<_> = terminal
                .iter()
                .map(|members| mask_for_members(adjacency.len(), members))
                .collect();
            let mis_union = union_masks(&mis_masks, adjacency.len());
            let mis_boundary = boundary_mask(&mis_union, dims)?;
            let absorptions = mis_masks
                .iter()
                .map(|mask| {
                    support_absorption(
                        &ulam,
                        mask,
                        config.absorption_max_iterations,
                        config.absorption_tolerance,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            let contact_thresholds = config
                .dual_deficit_thresholds
                .iter()
                .map(|threshold| {
                    contact_result(
                        &mis_masks,
                        &absorptions,
                        *threshold,
                        config.contact_distance_box_diagonals,
                        ulam.grid(),
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            let primary = contact_thresholds
                .iter()
                .find(|result| result.deficit_threshold == config.primary_dual_deficit_threshold)
                .ok_or_else(|| "Primary contact threshold result is missing".to_string())?;
            let dual_contact_clusters = primary.contact_clusters;
            let minimum_dual_separation_box_units = primary.minimum_separation_box_units;
            let dual_contact_count_stable_across_thresholds = contact_thresholds
                .iter()
                .all(|result| result.contact_clusters == dual_contact_clusters);
            let maximum_absorption_residual = absorptions
                .iter()
                .map(|result| result.residual)
                .fold(0.0, f64::max);
            let (manifold_to_boundary, boundary_to_manifold) =
                manifold_comparison(&manifold, &mis_boundary, ulam.grid());
            let diagonal = ulam.grid().step.x.hypot(ulam.grid().step.y);
            let expected_mis_count = if a < target_a { 1 } else { 2 };
            let mis_count_matches_expected = terminal.len() == expected_mis_count;
            let two_contact_signature_passes =
                (a == target_a).then_some(dual_contact_clusters == 2);
            let manifold_comparison_passes = (!manifold.is_empty()).then_some(
                manifold_to_boundary.is_some_and(|distance| {
                    distance / diagonal <= config.manifold_distance_limit_box_units
                }) && boundary_to_manifold.is_some_and(|distance| {
                    distance / diagonal <= config.manifold_distance_limit_box_units
                }),
            );
            let row_supports_requested_signature = mis_count_matches_expected
                && two_contact_signature_passes.unwrap_or(true)
                && manifold_comparison_passes.unwrap_or(true);

            rows.push(RefinementRow {
                a,
                grid: dims,
                box_width: ulam.grid().step.x,
                box_height: ulam.grid().step.y,
                period_two_points,
                period_two_stable_points,
                period_two_saddle_points,
                maximum_period_two_residual: residual,
                mis_count: terminal.len(),
                expected_mis_count,
                mis_count_matches_expected,
                mis_spatial_components: component_count(&mis_union, dims)?,
                mis_box_count: mis_union.iter().filter(|included| **included).count(),
                contact_thresholds,
                dual_contact_clusters,
                dual_contact_count_stable_across_thresholds,
                minimum_dual_separation_box_units,
                maximum_absorption_residual,
                manifold_point_count: manifold.len(),
                manifold_to_mis_boundary_p95: manifold_to_boundary,
                manifold_to_mis_boundary_p95_box_units: manifold_to_boundary
                    .map(|distance| distance / diagonal),
                mis_boundary_to_manifold_p95: boundary_to_manifold,
                mis_boundary_to_manifold_p95_box_units: boundary_to_manifold
                    .map(|distance| distance / diagonal),
                two_contact_signature_passes,
                manifold_comparison_passes,
                row_supports_requested_signature,
            });
        }
    }
    let assessments = build_assessments(&config, &rows);
    let accepted = assessments
        .iter()
        .find(|assessment| assessment.id == "wei_mis_split_near_a_0_595")
        .is_some_and(|assessment| assessment.status == AssessmentStatus::Supported);
    let generated_unix_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock precedes Unix epoch: {error}"))?
        .as_secs();

    Ok(WeiRefinementBundle {
        schema: "bist-wei-henon-refinement",
        schema_version: 1,
        software_version: env!("CARGO_PKG_VERSION"),
        profile: match profile {
            RefinementProfile::Smoke => "smoke",
            RefinementProfile::Reference => "reference",
        },
        generated_unix_seconds,
        model: "H_a,b(x,y)=(1-a*x^2+y,b*x), b=0.3, epsilon=0.0625",
        noise_geometry: "Euclidean box/ball intersection",
        mis_estimator: "terminal strongly connected classes of the finite transition graph",
        config,
        rows,
        assessments,
        accepted,
        scope_note: "Terminal graph classes, support-seeded dual absorption, and finite projected manifolds are numerical evidence, not a proof. A not_supported assessment means that this refinement bundle does not justify the claim; it does not prove the thesis claim false.",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_refinement_fails_before_computation() {
        let mut config = RefinementConfig::for_profile(RefinementProfile::Smoke);
        config.grid_dimensions = vec![(64, 32)];
        let error = run_wei_split_refinement_with_config(RefinementProfile::Smoke, config)
            .expect_err("one grid must be rejected");
        assert!(error.contains("at least two grids"));
    }

    #[test]
    fn acceptance_table_has_one_data_line_per_row() {
        let bundle = WeiRefinementBundle {
            schema: "test",
            schema_version: 1,
            software_version: "test",
            profile: "test",
            generated_unix_seconds: 0,
            model: "test",
            noise_geometry: "test",
            mis_estimator: "test",
            config: RefinementConfig::for_profile(RefinementProfile::Smoke),
            rows: vec![],
            assessments: vec![],
            accepted: false,
            scope_note: "test",
        };
        assert_eq!(bundle.acceptance_table_csv().lines().count(), 1);
    }
}
