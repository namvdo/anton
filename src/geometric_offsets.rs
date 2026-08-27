//! Direct pointwise normal projections of an MIS boundary.
//!
//! For each ordered extended boundary sample `(p_i, n_i)`, the implementation
//! normalizes the attached outward normal and stores `p_i + epsilon * n_i`.
//! It does not replace the dynamically transported MIS normal with a polygonal
//! edge-normal estimate. No signed-distance grid or contour extraction is
//! involved.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::henon_extended_map::{inverse_henon_extended_point, HenonExtendedPoint};
use crate::range::PhaseSpaceBounds;

const NORMAL_EPSILON: f64 = 1e-14;
const MAX_INVERSE_POINTS_PER_FRAGMENT: usize = 200_000;
const DEFAULT_MAX_RETAINED_INVERSE_POINTS: usize = 100_000;
const MAX_RETAINED_POINTS_PER_CURVE: usize = 8_192;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ExtendedBoundaryPoint {
    pub x: f64,
    pub y: f64,
    pub nx: f64,
    pub ny: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundaryComponent {
    pub id: usize,
    pub points: Vec<ExtendedBoundaryPoint>,
    /// True only when the input explicitly repeats its first point at the end.
    #[serde(default)]
    pub is_closed: bool,
    pub is_hole: bool,
    #[serde(default)]
    pub perimeter: f64,
    #[serde(default)]
    pub is_simple: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeometricOffsetStopReason {
    RequestedLevelsCompleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometricOffsetLevel {
    pub level: usize,
    pub target_distance: f64,
    pub boundary_components: Vec<BoundaryComponent>,
    pub component_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometricOffsetResult {
    pub levels: Vec<GeometricOffsetLevel>,
    pub completed_levels: usize,
    pub epsilon: f64,
    pub stop_reason: GeometricOffsetStopReason,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseOffsetCurve {
    pub source_level: usize,
    pub source_component_id: usize,
    pub inverse_iteration: usize,
    pub is_closed: bool,
    pub is_hole: bool,
    pub points: Vec<ExtendedBoundaryPoint>,
    pub input_point_count: usize,
    pub output_point_count: usize,
    pub retained_point_count: usize,
    pub display_decimated: bool,
    pub closure_position_residual: f64,
    pub closure_normal_residual: f64,
    pub max_position_chord_error: f64,
    pub max_normal_chord_error: f64,
    pub subdivision_limit_reached: bool,
    pub source_relation: InverseCurveSourceRelation,
    #[serde(default)]
    pub local_spacings: Vec<f64>,
    #[serde(default)]
    pub step_ratios: Vec<f64>,
    #[serde(default)]
    pub densities: Vec<f64>,
}

/// Polygonal relation between one inverse image and the curve mapped into it.
///
/// Only `NestedOutside` has the geometry required of an expanding candidate
/// predecessor boundary. The relation is diagnostic: it does not certify the
/// trapping-set assumptions required for a robust basin computation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InverseCurveSourceRelation {
    OpenPointSet,
    NestedOutside,
    CrossesSource,
    SourceNotEnclosed,
    SourceNotSimple,
    InverseNotSimple,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseOffsetResult {
    pub curves: Vec<InverseOffsetCurve>,
    pub source_curve_count: usize,
    pub completed_iterations: usize,
    pub total_output_points: usize,
    pub retained_output_points: usize,
    pub result_point_budget: usize,
    pub max_position_chord_error: f64,
    pub max_normal_chord_error: f64,
    pub subdivision_limit_reached: bool,
}

fn evenly_spaced_indices(point_count: usize, retained_count: usize, is_closed: bool) -> Vec<usize> {
    if retained_count >= point_count {
        return (0..point_count).collect();
    }
    if retained_count == 0 || point_count == 0 {
        return Vec::new();
    }
    if retained_count == 1 {
        return vec![0];
    }

    let denominator = if is_closed {
        retained_count
    } else {
        retained_count - 1
    };
    let source_span = if is_closed {
        point_count
    } else {
        point_count - 1
    };
    (0..retained_count)
        .map(|index| index.saturating_mul(source_span) / denominator)
        .collect()
}

fn retain_at_indices<T: Copy>(values: &[T], indices: &[usize]) -> Vec<T> {
    indices
        .iter()
        .filter_map(|&index| values.get(index).copied())
        .collect()
}

fn rebalance_retained_inverse_curves(curves: &mut [InverseOffsetCurve], point_budget: usize) {
    let retained_total = curves.iter().map(|curve| curve.points.len()).sum::<usize>();
    if retained_total <= point_budget || curves.is_empty() {
        return;
    }
    let per_curve_budget = (point_budget / curves.len()).max(1);
    for curve in curves {
        if curve.points.len() <= per_curve_budget {
            continue;
        }
        let indices = evenly_spaced_indices(curve.points.len(), per_curve_budget, curve.is_closed);
        curve.points = retain_at_indices(&curve.points, &indices);
        curve.local_spacings = retain_at_indices(&curve.local_spacings, &indices);
        curve.step_ratios = retain_at_indices(&curve.step_ratios, &indices);
        curve.densities = retain_at_indices(&curve.densities, &indices);
        curve.retained_point_count = curve.points.len();
        curve.display_decimated = curve.retained_point_count < curve.output_point_count;
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point2 {
    pub x: f64,
    pub y: f64,
}

impl Point2 {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    fn distance(self, other: Self) -> f64 {
        (self.x - other.x).hypot(self.y - other.y)
    }
}

fn path_length(points: &[Point2]) -> f64 {
    points
        .windows(2)
        .map(|pair| pair[0].distance(pair[1]))
        .sum()
}

fn cross(a: Point2, b: Point2, c: Point2) -> f64 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

#[derive(Clone, Copy)]
struct Segment {
    start: Point2,
    end: Point2,
}

impl Segment {
    fn x_bounds(self) -> (f64, f64) {
        (self.start.x.min(self.end.x), self.start.x.max(self.end.x))
    }

    fn y_bounds(self) -> (f64, f64) {
        (self.start.y.min(self.end.y), self.start.y.max(self.end.y))
    }
}

fn polygon_segments(points: &[Point2]) -> Vec<Segment> {
    (0..points.len())
        .map(|index| Segment {
            start: points[index],
            end: points[(index + 1) % points.len()],
        })
        .collect()
}

fn point_lies_on_segment(point: Point2, segment: Segment) -> bool {
    let coordinate_scale = point
        .x
        .abs()
        .max(point.y.abs())
        .max(segment.start.x.abs())
        .max(segment.start.y.abs())
        .max(segment.end.x.abs())
        .max(segment.end.y.abs());
    let tolerance = 1e-12 * (1.0 + coordinate_scale * coordinate_scale);
    if cross(segment.start, segment.end, point).abs() > tolerance {
        return false;
    }
    let (x_min, x_max) = segment.x_bounds();
    let (y_min, y_max) = segment.y_bounds();
    point.x >= x_min - tolerance
        && point.x <= x_max + tolerance
        && point.y >= y_min - tolerance
        && point.y <= y_max + tolerance
}

fn segments_intersect_or_touch(left: Segment, right: Segment) -> bool {
    let a = left.start;
    let b = left.end;
    let c = right.start;
    let d = right.end;
    let (ab_c, ab_d, cd_a, cd_b) = (
        cross(a, b, c),
        cross(a, b, d),
        cross(c, d, a),
        cross(c, d, b),
    );
    (ab_c * ab_d < 0.0 && cd_a * cd_b < 0.0)
        || point_lies_on_segment(c, left)
        || point_lies_on_segment(d, left)
        || point_lies_on_segment(a, right)
        || point_lies_on_segment(b, right)
}

struct SegmentGrid {
    cells: HashMap<(usize, usize), Vec<usize>>,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    side: usize,
}

impl SegmentGrid {
    fn new(segments: &[Segment]) -> Self {
        let mut x_min = f64::INFINITY;
        let mut x_max = f64::NEG_INFINITY;
        let mut y_min = f64::INFINITY;
        let mut y_max = f64::NEG_INFINITY;
        for segment in segments {
            let (segment_x_min, segment_x_max) = segment.x_bounds();
            let (segment_y_min, segment_y_max) = segment.y_bounds();
            x_min = x_min.min(segment_x_min);
            x_max = x_max.max(segment_x_max);
            y_min = y_min.min(segment_y_min);
            y_max = y_max.max(segment_y_max);
        }
        let side = (segments.len() as f64).sqrt().ceil().max(1.0) as usize;
        let mut grid = Self {
            cells: HashMap::new(),
            x_min,
            x_max,
            y_min,
            y_max,
            side,
        };
        for (index, segment) in segments.iter().copied().enumerate() {
            if let Some((x_start, x_end, y_start, y_end)) = grid.cell_range(segment) {
                for x_cell in x_start..=x_end {
                    for y_cell in y_start..=y_end {
                        grid.cells.entry((x_cell, y_cell)).or_default().push(index);
                    }
                }
            }
        }
        grid
    }

    fn coordinate_cell(value: f64, minimum: f64, maximum: f64, side: usize) -> usize {
        let span = maximum - minimum;
        if span <= NORMAL_EPSILON {
            return 0;
        }
        (((value - minimum) / span * side as f64).floor() as isize).clamp(0, side as isize - 1)
            as usize
    }

    fn cell_range(&self, segment: Segment) -> Option<(usize, usize, usize, usize)> {
        let (segment_x_min, segment_x_max) = segment.x_bounds();
        let (segment_y_min, segment_y_max) = segment.y_bounds();
        if segment_x_max < self.x_min
            || segment_x_min > self.x_max
            || segment_y_max < self.y_min
            || segment_y_min > self.y_max
        {
            return None;
        }
        let clipped_x_min = segment_x_min.max(self.x_min);
        let clipped_x_max = segment_x_max.min(self.x_max);
        let clipped_y_min = segment_y_min.max(self.y_min);
        let clipped_y_max = segment_y_max.min(self.y_max);
        Some((
            Self::coordinate_cell(clipped_x_min, self.x_min, self.x_max, self.side),
            Self::coordinate_cell(clipped_x_max, self.x_min, self.x_max, self.side),
            Self::coordinate_cell(clipped_y_min, self.y_min, self.y_max, self.side),
            Self::coordinate_cell(clipped_y_max, self.y_min, self.y_max, self.side),
        ))
    }
}

fn segment_sets_intersect(indexed: &[Segment], queries: &[Segment], same_polygon: bool) -> bool {
    if indexed.is_empty() || queries.is_empty() {
        return false;
    }
    let grid = SegmentGrid::new(indexed);
    let mut last_query_seen = vec![usize::MAX; indexed.len()];
    for (query_index, query) in queries.iter().copied().enumerate() {
        let Some((x_start, x_end, y_start, y_end)) = grid.cell_range(query) else {
            continue;
        };
        for x_cell in x_start..=x_end {
            for y_cell in y_start..=y_end {
                let Some(candidate_indices) = grid.cells.get(&(x_cell, y_cell)) else {
                    continue;
                };
                for &candidate_index in candidate_indices {
                    if last_query_seen[candidate_index] == query_index {
                        continue;
                    }
                    last_query_seen[candidate_index] = query_index;
                    if same_polygon
                        && (candidate_index <= query_index
                            || candidate_index == (query_index + 1) % queries.len()
                            || query_index == (candidate_index + 1) % indexed.len())
                    {
                        continue;
                    }
                    if segments_intersect_or_touch(indexed[candidate_index], query) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn has_self_intersection(points: &[Point2]) -> bool {
    let segments = polygon_segments(points);
    segment_sets_intersect(&segments, &segments, true)
}

fn boundaries_intersect(left: &[Point2], right: &[Point2]) -> bool {
    segment_sets_intersect(&polygon_segments(left), &polygon_segments(right), false)
}

fn polygon_contains_point(polygon: &[Point2], point: Point2) -> bool {
    let mut inside = false;
    for index in 0..polygon.len() {
        let current = polygon[index];
        let next = polygon[(index + 1) % polygon.len()];
        if (current.y > point.y) != (next.y > point.y) {
            let x_at_ray =
                current.x + (point.y - current.y) * (next.x - current.x) / (next.y - current.y);
            if point.x < x_at_ray {
                inside = !inside;
            }
        }
    }
    inside
}

fn positions(points: &[ExtendedBoundaryPoint]) -> Vec<Point2> {
    points
        .iter()
        .map(|point| Point2::new(point.x, point.y))
        .collect()
}

fn classify_inverse_source_relation(
    source: &[ExtendedBoundaryPoint],
    inverse: &[ExtendedBoundaryPoint],
) -> InverseCurveSourceRelation {
    let source_positions = positions(source);
    let inverse_positions = positions(inverse);
    if has_self_intersection(&source_positions) {
        return InverseCurveSourceRelation::SourceNotSimple;
    }
    if has_self_intersection(&inverse_positions) {
        return InverseCurveSourceRelation::InverseNotSimple;
    }
    if boundaries_intersect(&source_positions, &inverse_positions) {
        return InverseCurveSourceRelation::CrossesSource;
    }
    if polygon_contains_point(&inverse_positions, source_positions[0]) {
        InverseCurveSourceRelation::NestedOutside
    } else {
        InverseCurveSourceRelation::SourceNotEnclosed
    }
}

fn normalize_vector(x: f64, y: f64, context: &str) -> Result<(f64, f64), String> {
    let length = x.hypot(y);
    if !length.is_finite() || length < NORMAL_EPSILON {
        return Err(format!("{context} produced a degenerate direction"));
    }
    Ok((x / length, y / length))
}

fn validate_boundary(
    boundary: &[(f64, f64, f64, f64)],
) -> Result<Vec<ExtendedBoundaryPoint>, String> {
    if boundary.is_empty() {
        return Err("MIS boundary needs at least one extended point".to_string());
    }

    let mut points = Vec::with_capacity(boundary.len());
    for &(x, y, nx, ny) in boundary {
        if ![x, y, nx, ny].iter().all(|value| value.is_finite()) {
            return Err("MIS boundary contains a non-finite position or normal".to_string());
        }
        let (nx, ny) = normalize_vector(nx, ny, "Attached MIS boundary normal")?;
        points.push(ExtendedBoundaryPoint { x, y, nx, ny });
    }
    Ok(points)
}

fn direct_normal_projection(
    boundary: &[ExtendedBoundaryPoint],
    epsilon: f64,
) -> Result<BoundaryComponent, String> {
    let mut points = Vec::with_capacity(boundary.len());
    let mut projected_positions = Vec::with_capacity(boundary.len());

    for current in boundary {
        let projected = Point2::new(
            current.x + epsilon * current.nx,
            current.y + epsilon * current.ny,
        );
        if !projected.x.is_finite() || !projected.y.is_finite() {
            return Err("Direct normal projection produced a non-finite point".to_string());
        }
        projected_positions.push(projected);
        points.push(ExtendedBoundaryPoint {
            x: projected.x,
            y: projected.y,
            nx: current.nx,
            ny: current.ny,
        });
    }

    let is_closed = boundary.len() >= 2
        && boundary
            .first()
            .zip(boundary.last())
            .is_some_and(|(first, last)| {
                Point2::new(first.x, first.y).distance(Point2::new(last.x, last.y))
                    <= NORMAL_EPSILON
                    && (first.nx - last.nx).hypot(first.ny - last.ny) <= NORMAL_EPSILON
            });

    Ok(BoundaryComponent {
        id: 0,
        points,
        is_closed,
        is_hole: false,
        perimeter: path_length(&projected_positions),
        is_simple: projected_positions.len() < 3 || !has_self_intersection(&projected_positions),
    })
}

/// Project every MIS boundary sample exactly `epsilon` along its attached
/// outward unit normal, preserving input length and order without closing it.
pub fn compute_geometric_offset_contours(
    boundary: &[(f64, f64, f64, f64)],
    epsilon: f64,
) -> Result<GeometricOffsetResult, String> {
    if !epsilon.is_finite() || epsilon <= 0.0 {
        return Err("Geometric offset distance must be positive and finite".to_string());
    }

    let boundary = validate_boundary(boundary)?;
    let component = direct_normal_projection(&boundary, epsilon)?;
    let level = GeometricOffsetLevel {
        level: 1,
        target_distance: epsilon,
        boundary_components: vec![component],
        component_count: 1,
    };

    Ok(GeometricOffsetResult {
        levels: vec![level],
        completed_levels: 1,
        epsilon,
        stop_reason: GeometricOffsetStopReason::RequestedLevelsCompleted,
    })
}

fn circular_difference(left: f64, right: f64) -> f64 {
    (left - right).sin().atan2((left - right).cos())
}

fn interpolate_extended_point(
    left: ExtendedBoundaryPoint,
    right: ExtendedBoundaryPoint,
    fraction: f64,
) -> ExtendedBoundaryPoint {
    let left_theta = left.ny.atan2(left.nx);
    let right_theta = right.ny.atan2(right.nx);
    let theta = left_theta + fraction * circular_difference(right_theta, left_theta);
    ExtendedBoundaryPoint {
        x: left.x + fraction * (right.x - left.x),
        y: left.y + fraction * (right.y - left.y),
        nx: theta.cos(),
        ny: theta.sin(),
    }
}

fn inverse_offset_point(
    point: ExtendedBoundaryPoint,
    a: f64,
    b: f64,
    epsilon: f64,
) -> Result<ExtendedBoundaryPoint, String> {
    let mapped = inverse_henon_extended_point(
        HenonExtendedPoint {
            x: point.x,
            y: point.y,
            nx: point.nx,
            ny: point.ny,
        },
        a,
        b,
        epsilon,
    )?;
    Ok(ExtendedBoundaryPoint {
        x: mapped.x,
        y: mapped.y,
        nx: mapped.nx,
        ny: mapped.ny,
    })
}

#[derive(Default)]
struct InverseSubdivisionDiagnostics {
    max_position_chord_error: f64,
    max_normal_chord_error: f64,
    subdivision_limit_reached: bool,
}

struct InverseSubdivisionSettings {
    a: f64,
    b: f64,
    epsilon: f64,
    position_tolerance: f64,
    normal_tolerance: f64,
    max_depth: usize,
    bounds: PhaseSpaceBounds,
}

/// Adaptively sample the inverse image of one source-curve segment.
///
/// The caller has already stored the mapped left endpoint. Each accepted leaf
/// appends only its mapped right endpoint. An explicit depth-first work stack
/// preserves curve order and prevents call-stack growth on highly expanded
/// inverse curves.
fn append_inverse_segment(
    source_left: ExtendedBoundaryPoint,
    source_right: ExtendedBoundaryPoint,
    mapped_left: ExtendedBoundaryPoint,
    mapped_right: ExtendedBoundaryPoint,
    depth: usize,
    settings: &InverseSubdivisionSettings,
    diagnostics: &mut InverseSubdivisionDiagnostics,
    refined_source: &mut Vec<ExtendedBoundaryPoint>,
    mapped_output: &mut Vec<ExtendedBoundaryPoint>,
) -> Result<bool, String> {
    let mut pending = vec![(source_left, source_right, mapped_left, mapped_right, depth)];
    while let Some((left, right, mapped_left, mapped_right, depth)) = pending.pop() {
        if mapped_output.len() >= MAX_INVERSE_POINTS_PER_FRAGMENT {
            diagnostics.subdivision_limit_reached = true;
            return Ok(false);
        }

        // A segment whose endpoints lie beyond the same side of the compact
        // domain cannot contribute a straight clipped chord. Do not spend any
        // midpoint evaluations refining that exterior part.
        if settings.bounds.same_exterior_half_plane(
            mapped_left.x,
            mapped_left.y,
            mapped_right.x,
            mapped_right.y,
        ) {
            refined_source.push(right);
            mapped_output.push(mapped_right);
            continue;
        }

        let source_midpoint = interpolate_extended_point(left, right, 0.5);
        let mapped_midpoint =
            inverse_offset_point(source_midpoint, settings.a, settings.b, settings.epsilon)?;
        let chord_midpoint_x = 0.5 * (mapped_left.x + mapped_right.x);
        let chord_midpoint_y = 0.5 * (mapped_left.y + mapped_right.y);
        let position_error =
            (mapped_midpoint.x - chord_midpoint_x).hypot(mapped_midpoint.y - chord_midpoint_y);
        let left_theta = mapped_left.ny.atan2(mapped_left.nx);
        let right_theta = mapped_right.ny.atan2(mapped_right.nx);
        let chord_midpoint_theta = left_theta + 0.5 * circular_difference(right_theta, left_theta);
        let mapped_midpoint_theta = mapped_midpoint.ny.atan2(mapped_midpoint.nx);
        let normal_error = circular_difference(mapped_midpoint_theta, chord_midpoint_theta).abs();
        let mapped_position_gap = Point2::new(mapped_left.x, mapped_left.y)
            .distance(Point2::new(mapped_right.x, mapped_right.y));
        let mapped_normal_gap = circular_difference(right_theta, left_theta).abs();
        let requires_subdivision = mapped_position_gap > settings.position_tolerance
            || mapped_normal_gap > settings.normal_tolerance
            || position_error > settings.position_tolerance
            || normal_error > settings.normal_tolerance;

        if requires_subdivision && depth < settings.max_depth {
            // Push right first so the left half is processed first.
            pending.push((
                source_midpoint,
                right,
                mapped_midpoint,
                mapped_right,
                depth + 1,
            ));
            pending.push((
                left,
                source_midpoint,
                mapped_left,
                mapped_midpoint,
                depth + 1,
            ));
            continue;
        }

        diagnostics.max_position_chord_error =
            diagnostics.max_position_chord_error.max(position_error);
        diagnostics.max_normal_chord_error = diagnostics.max_normal_chord_error.max(normal_error);
        diagnostics.subdivision_limit_reached |= requires_subdivision;
        refined_source.push(right);
        mapped_output.push(mapped_right);
    }
    Ok(true)
}

struct InvertedComponent {
    refined_source: Vec<ExtendedBoundaryPoint>,
    mapped_output: Vec<ExtendedBoundaryPoint>,
    closure_position_residual: f64,
    closure_normal_residual: f64,
    diagnostics: InverseSubdivisionDiagnostics,
    output_is_closed: bool,
}

fn invert_offset_component(
    source: &[ExtendedBoundaryPoint],
    is_closed: bool,
    settings: &InverseSubdivisionSettings,
) -> Result<InvertedComponent, String> {
    if source.is_empty() {
        return Err("An inverse offset component requires at least one point".to_string());
    }
    let mapped_first = inverse_offset_point(source[0], settings.a, settings.b, settings.epsilon)?;
    let mut refined_source = Vec::with_capacity(source.len());
    let mut mapped_output = Vec::with_capacity(source.len());
    refined_source.push(source[0]);
    mapped_output.push(mapped_first);
    let mut diagnostics = InverseSubdivisionDiagnostics::default();
    let segment_count = if is_closed {
        source.len()
    } else {
        source.len().saturating_sub(1)
    };
    let mut completed_all_segments = true;
    for index in 0..segment_count {
        let next_index = (index + 1) % source.len();
        let mapped_left = *mapped_output
            .last()
            .ok_or("Inverse offset output unexpectedly became empty")?;
        let mapped_right = if next_index == 0 {
            mapped_first
        } else {
            inverse_offset_point(source[next_index], settings.a, settings.b, settings.epsilon)?
        };
        if !append_inverse_segment(
            source[index],
            source[next_index],
            mapped_left,
            mapped_right,
            0,
            settings,
            &mut diagnostics,
            &mut refined_source,
            &mut mapped_output,
        )? {
            completed_all_segments = false;
            break;
        }
    }

    let output_is_closed = is_closed && completed_all_segments;
    let (closure_position_residual, closure_normal_residual) = if output_is_closed {
        let repeated_source = refined_source
            .pop()
            .ok_or("Inverse offset source unexpectedly became empty")?;
        let repeated_first = mapped_output
            .pop()
            .ok_or("Inverse offset component unexpectedly became empty")?;
        debug_assert_eq!(repeated_source, source[0]);
        (
            (repeated_first.x - mapped_first.x).hypot(repeated_first.y - mapped_first.y),
            circular_difference(
                repeated_first.ny.atan2(repeated_first.nx),
                mapped_first.ny.atan2(mapped_first.nx),
            )
            .abs(),
        )
    } else {
        (0.0, 0.0)
    };
    Ok(InvertedComponent {
        refined_source,
        mapped_output,
        closure_position_residual,
        closure_normal_residual,
        diagnostics,
        output_is_closed,
    })
}

#[derive(Debug)]
struct ClippedInverseFragment {
    source: Vec<ExtendedBoundaryPoint>,
    mapped: Vec<ExtendedBoundaryPoint>,
    is_closed: bool,
}

fn points_nearly_equal(left: ExtendedBoundaryPoint, right: ExtendedBoundaryPoint) -> bool {
    (left.x - right.x).hypot(left.y - right.y) <= 1e-12
}

fn clip_aligned_inverse_curve(
    source: &[ExtendedBoundaryPoint],
    mapped: &[ExtendedBoundaryPoint],
    is_closed: bool,
    bounds: PhaseSpaceBounds,
) -> Vec<ClippedInverseFragment> {
    if source.len() != mapped.len() || mapped.is_empty() {
        return Vec::new();
    }
    if mapped.iter().all(|point| bounds.contains(point.x, point.y)) {
        return vec![ClippedInverseFragment {
            source: source.to_vec(),
            mapped: mapped.to_vec(),
            is_closed,
        }];
    }

    let segment_count = if is_closed {
        mapped.len()
    } else {
        mapped.len().saturating_sub(1)
    };
    let mut fragments: Vec<ClippedInverseFragment> = Vec::new();
    let mut current_source = Vec::new();
    let mut current_mapped = Vec::new();
    let flush = |fragments: &mut Vec<ClippedInverseFragment>,
                 current_source: &mut Vec<ExtendedBoundaryPoint>,
                 current_mapped: &mut Vec<ExtendedBoundaryPoint>| {
        if !current_mapped.is_empty() {
            fragments.push(ClippedInverseFragment {
                source: std::mem::take(current_source),
                mapped: std::mem::take(current_mapped),
                is_closed: false,
            });
        }
    };

    for index in 0..segment_count {
        let next = (index + 1) % mapped.len();
        let Some((enter, leave)) = bounds.clip_segment_parameters(
            mapped[index].x,
            mapped[index].y,
            mapped[next].x,
            mapped[next].y,
        ) else {
            flush(&mut fragments, &mut current_source, &mut current_mapped);
            continue;
        };
        let mapped_enter = interpolate_extended_point(mapped[index], mapped[next], enter);
        let mapped_leave = interpolate_extended_point(mapped[index], mapped[next], leave);
        let source_enter = interpolate_extended_point(source[index], source[next], enter);
        let source_leave = interpolate_extended_point(source[index], source[next], leave);

        if current_mapped
            .last()
            .copied()
            .map_or(true, |last| !points_nearly_equal(last, mapped_enter))
        {
            flush(&mut fragments, &mut current_source, &mut current_mapped);
            current_source.push(source_enter);
            current_mapped.push(mapped_enter);
        }
        if current_mapped
            .last()
            .copied()
            .map_or(true, |last| !points_nearly_equal(last, mapped_leave))
        {
            current_source.push(source_leave);
            current_mapped.push(mapped_leave);
        }
        if leave < 1.0 - 1e-12 {
            flush(&mut fragments, &mut current_source, &mut current_mapped);
        }
    }
    flush(&mut fragments, &mut current_source, &mut current_mapped);

    // A closed traversal can split a single in-domain run at array index zero.
    // Merge only those two seam fragments; other exterior gaps remain separate.
    if is_closed && fragments.len() >= 2 {
        let joins_at_seam = fragments
            .last()
            .and_then(|last| last.mapped.last())
            .zip(fragments.first().and_then(|first| first.mapped.first()))
            .is_some_and(|(last, first)| points_nearly_equal(*last, *first));
        if joins_at_seam {
            if let Some(mut last) = fragments.pop() {
                let first = fragments.remove(0);
                last.source.extend(first.source.into_iter().skip(1));
                last.mapped.extend(first.mapped.into_iter().skip(1));
                fragments.insert(0, last);
            }
        }
    }
    fragments
}

/// Central-difference neighbor spacing along an ordered, fixed tracer set.
///
/// Use each point's two immediate neighbors so the estimate doesn't lean in one direction.
/// For a closed curve (`closed = true`) neighbor indices wrap around;
/// for an open curve the endpoints fall back to a one-sided difference since they only have one neighbor.
pub fn local_spacing(points: &[Point2], closed: bool) -> Vec<f64> {
    let n = points.len();
    if n < 2 {
        return vec![0.0; n];
    }

    (0..n)
        .map(|i| {
            if closed {
                let prev = points[(i + n - 1) % n];
                let next = points[(i + 1) % n];
                prev.distance(next) / 2.0
            } else if i == 0 {
                points[0].distance(points[1])
            } else if i == n - 1 {
                points[n - 2].distance(points[n - 1])
            } else {
                points[i - 1].distance(points[i + 1]) / 2.0
            }
        })
        .collect()
}

/// Elementwise spacing[i] / previous_spacing[i] -- the one-step local
/// expansion (>1) or contraction (<1) factor for each tracer.
///
/// Both slices must be the same length and index-aligned. Adaptive inverse
/// refinement preserves this relation by measuring the refined source points
/// against their pointwise inverse images.
pub fn step_ratio(previous_spacing: &[f64], current_spacing: &[f64]) -> Vec<f64> {
    previous_spacing
        .iter()
        .zip(current_spacing)
        .map(|(&prev, &curr)| {
            if prev < NORMAL_EPSILON {
                f64::INFINITY
            } else {
                curr / prev
            }
        })
        .collect()
}

/// Apply repeated inverse extended Hénon steps with adaptive source refinement.
///
/// Before accepting an inverse-image segment, the routine requires adjacent
/// mapped positions and normals to lie within `position_tolerance` and
/// `normal_tolerance`. It inserts the exact source chord midpoint, interpolates
/// its normal along the shortest unit-circle arc, maps that new extended point,
/// and recurses until the tolerances or `max_subdivision_depth` are reached.
pub fn compute_inverse_geometric_offset_contours(
    levels: &[GeometricOffsetLevel],
    a: f64,
    b: f64,
    epsilon: f64,
    iterations: usize,
    position_tolerance: f64,
    normal_tolerance: f64,
    max_subdivision_depth: usize,
) -> Result<InverseOffsetResult, String> {
    compute_inverse_geometric_offset_contours_with_bounds(
        levels,
        a,
        b,
        epsilon,
        iterations,
        position_tolerance,
        normal_tolerance,
        max_subdivision_depth,
        PhaseSpaceBounds::try_new(-10.0, 10.0, -10.0, 10.0)
            .expect("the global inverse-offset bounds are valid"),
        DEFAULT_MAX_RETAINED_INVERSE_POINTS,
    )
}

// Just return the last iteration result of the inverse map to save space for now
pub fn compute_inverse_geometric_offset_contours_with_bounds(
    levels: &[GeometricOffsetLevel],
    a: f64,
    b: f64,
    epsilon: f64,
    iterations: usize,
    position_tolerance: f64,
    normal_tolerance: f64,
    max_subdivision_depth: usize,
    bounds: PhaseSpaceBounds,
    max_retained_points: usize,
) -> Result<InverseOffsetResult, String> {
    if levels.is_empty() {
        return Err("Compute geometric offset contours before their inverse images".to_string());
    }
    if iterations == 0 || iterations > 100 {
        return Err("Inverse offset iterations must lie between 1 and 100".to_string());
    }
    if !position_tolerance.is_finite() || position_tolerance <= 0.0 {
        return Err("Inverse offset position tolerance must be positive and finite".to_string());
    }
    if !normal_tolerance.is_finite() || normal_tolerance <= 0.0 || normal_tolerance > 0.5 {
        return Err("Inverse offset normal tolerance must lie in (0, 0.5] radians".to_string());
    }
    if max_subdivision_depth > 10 {
        return Err("Inverse offset subdivision depth cannot exceed 10".to_string());
    }
    if max_retained_points == 0 || max_retained_points > DEFAULT_MAX_RETAINED_INVERSE_POINTS {
        return Err(format!(
            "Inverse offset result point budget must lie between 1 and {DEFAULT_MAX_RETAINED_INVERSE_POINTS}"
        ));
    }

    let source_curve_count: usize = levels
        .iter()
        .map(|level| level.boundary_components.len())
        .sum();
    let mut curves = Vec::with_capacity(source_curve_count * iterations);
    let mut total_output_points = 0usize;
    let mut retained_output_points = 0usize;
    let mut result_max_position_chord_error: f64 = 0.0;
    let mut result_max_normal_chord_error: f64 = 0.0;
    let mut result_subdivision_limit_reached = false;
    let subdivision_settings = InverseSubdivisionSettings {
        a,
        b,
        epsilon,
        position_tolerance,
        normal_tolerance,
        max_depth: max_subdivision_depth,
        bounds,
    };
    let mut completed_iterations = 0usize;
    let planned_curve_count = source_curve_count.saturating_mul(iterations).max(1);
    let retained_points_per_curve =
        (max_retained_points / planned_curve_count).clamp(2, MAX_RETAINED_POINTS_PER_CURVE);

    for level in levels {
        for component in &level.boundary_components {
            let mut source_points = component.points.clone();
            if component.is_closed
                && source_points.first() == source_points.last()
                && source_points.len() > 1
            {
                source_points.pop();
            }
            if source_points.is_empty() {
                continue;
            }

            let mut active_fragments = vec![(source_points, component.is_closed)];
            for inverse_iteration in 1..=iterations {
                let mut next_fragments = Vec::new();
                for (source_points, source_is_closed) in active_fragments {
                    if source_points.is_empty() {
                        continue;
                    }
                    let input_point_count = source_points.len();
                    let inverted = invert_offset_component(
                        &source_points,
                        source_is_closed,
                        &subdivision_settings,
                    )?;

                    for fragment in clip_aligned_inverse_curve(
                        &inverted.refined_source,
                        &inverted.mapped_output,
                        inverted.output_is_closed,
                        bounds,
                    ) {
                        if fragment.mapped.is_empty() {
                            continue;
                        }
                        let source_point2: Vec<Point2> = fragment
                            .source
                            .iter()
                            .map(|p| Point2::new(p.x, p.y))
                            .collect();
                        let current_point2: Vec<Point2> = fragment
                            .mapped
                            .iter()
                            .map(|p| Point2::new(p.x, p.y))
                            .collect();
                        let source_spacing = local_spacing(&source_point2, fragment.is_closed);
                        let current_spacing = local_spacing(&current_point2, fragment.is_closed);
                        let current_ratios = step_ratio(&source_spacing, &current_spacing);
                        let densities: Vec<f64> = current_spacing
                            .iter()
                            .map(|&spacing| if spacing > 1e-14 { 1.0 / spacing } else { 0.0 })
                            .collect();
                        let source_relation = if fragment.is_closed {
                            classify_inverse_source_relation(&fragment.source, &fragment.mapped)
                        } else {
                            InverseCurveSourceRelation::OpenPointSet
                        };

                        total_output_points = total_output_points
                            .checked_add(fragment.mapped.len())
                            .ok_or("Inverse offset point count overflow")?;
                        let retained_count = fragment.mapped.len().min(retained_points_per_curve);
                        let retained_indices = evenly_spaced_indices(
                            fragment.mapped.len(),
                            retained_count,
                            fragment.is_closed,
                        );
                        let retained_points =
                            retain_at_indices(&fragment.mapped, &retained_indices);
                        let retained_spacings =
                            retain_at_indices(&current_spacing, &retained_indices);
                        let retained_ratios = retain_at_indices(&current_ratios, &retained_indices);
                        let retained_densities = retain_at_indices(&densities, &retained_indices);
                        retained_output_points = retained_output_points
                            .checked_add(retained_points.len())
                            .ok_or("Retained inverse offset point count overflow")?;
                        curves.push(InverseOffsetCurve {
                            source_level: level.level,
                            source_component_id: component.id,
                            inverse_iteration,
                            is_closed: fragment.is_closed,
                            is_hole: component.is_hole,
                            input_point_count,
                            output_point_count: fragment.mapped.len(),
                            retained_point_count: retained_points.len(),
                            display_decimated: retained_points.len() < fragment.mapped.len(),
                            points: retained_points,
                            closure_position_residual: if fragment.is_closed {
                                inverted.closure_position_residual
                            } else {
                                0.0
                            },
                            closure_normal_residual: if fragment.is_closed {
                                inverted.closure_normal_residual
                            } else {
                                0.0
                            },
                            max_position_chord_error: inverted.diagnostics.max_position_chord_error,
                            max_normal_chord_error: inverted.diagnostics.max_normal_chord_error,
                            subdivision_limit_reached: inverted
                                .diagnostics
                                .subdivision_limit_reached,
                            source_relation,
                            local_spacings: retained_spacings,
                            step_ratios: retained_ratios,
                            densities: retained_densities,
                        });
                        next_fragments.push((fragment.mapped, fragment.is_closed));
                    }
                    result_max_position_chord_error = result_max_position_chord_error
                        .max(inverted.diagnostics.max_position_chord_error);
                    result_max_normal_chord_error = result_max_normal_chord_error
                        .max(inverted.diagnostics.max_normal_chord_error);
                    result_subdivision_limit_reached |=
                        inverted.diagnostics.subdivision_limit_reached;
                }
                if next_fragments.is_empty() {
                    break;
                }
                completed_iterations = completed_iterations.max(inverse_iteration);
                active_fragments = next_fragments;
            }
        }
    }

    rebalance_retained_inverse_curves(&mut curves, max_retained_points);
    retained_output_points = curves.iter().map(|curve| curve.points.len()).sum();
    Ok(InverseOffsetResult {
        curves,
        source_curve_count,
        completed_iterations,
        total_output_points,
        retained_output_points,
        result_point_budget: max_retained_points,
        max_position_chord_error: result_max_position_chord_error,
        max_normal_chord_error: result_max_normal_chord_error,
        subdivision_limit_reached: result_subdivision_limit_reached,
    })
}

#[wasm_bindgen(js_name = "computeInverseGeometricOffsetContours")]
pub fn compute_inverse_geometric_offset_contours_js(
    levels_js: JsValue,
    a: f64,
    b: f64,
    epsilon: f64,
    iterations: usize,
    position_tolerance: f64,
    normal_tolerance: f64,
    max_subdivision_depth: usize,
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
    max_retained_points: usize,
) -> Result<JsValue, JsValue> {
    let levels: Vec<GeometricOffsetLevel> = serde_wasm_bindgen::from_value(levels_js)
        .map_err(|error| JsValue::from_str(&format!("Invalid geometric offset levels: {error}")))?;
    let bounds = PhaseSpaceBounds::try_new(x_min, x_max, y_min, y_max)
        .map_err(|error| JsValue::from_str(&error))?;
    let result = compute_inverse_geometric_offset_contours_with_bounds(
        &levels,
        a,
        b,
        epsilon,
        iterations,
        position_tolerance,
        normal_tolerance,
        max_subdivision_depth,
        bounds,
        max_retained_points,
    )
    .map_err(|error| JsValue::from_str(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!("Failed to serialize inverse contours: {error}"))
    })
}

#[wasm_bindgen(js_name = "computeGeometricOffsetContours")]
pub fn compute_geometric_offset_contours_js(
    boundary: JsValue,
    epsilon: f64,
) -> Result<JsValue, JsValue> {
    let seed: Vec<(f64, f64, f64, f64)> = serde_wasm_bindgen::from_value(boundary)
        .map_err(|error| JsValue::from_str(&format!("Invalid MIS boundary: {error}")))?;
    let result = compute_geometric_offset_contours(&seed, epsilon)
        .map_err(|error| JsValue::from_str(&error))?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!("Failed to serialize offset contours: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn circle(radius: f64, count: usize, reverse_order: bool) -> Vec<(f64, f64, f64, f64)> {
        let mut points = (0..count)
            .map(|index| {
                let angle = std::f64::consts::TAU * index as f64 / count as f64;
                (
                    radius * angle.cos(),
                    radius * angle.sin(),
                    2.0 * angle.cos(),
                    2.0 * angle.sin(),
                )
            })
            .collect::<Vec<_>>();
        if reverse_order {
            points.reverse();
        }
        points
    }

    fn square(x_min: f64, x_max: f64, y_min: f64, y_max: f64) -> Vec<ExtendedBoundaryPoint> {
        [
            (x_min, y_min),
            (x_max, y_min),
            (x_max, y_max),
            (x_min, y_max),
        ]
        .into_iter()
        .map(|(x, y)| ExtendedBoundaryPoint {
            x,
            y,
            nx: 1.0,
            ny: 0.0,
        })
        .collect()
    }

    fn maximum_adjacent_position_gap(points: &[ExtendedBoundaryPoint], is_closed: bool) -> f64 {
        let consecutive_max = points
            .windows(2)
            .map(|pair| (pair[1].x - pair[0].x).hypot(pair[1].y - pair[0].y))
            .fold(0.0, f64::max);
        if is_closed && points.len() > 1 {
            let first = points[0];
            let last = points[points.len() - 1];
            consecutive_max.max((first.x - last.x).hypot(first.y - last.y))
        } else {
            consecutive_max
        }
    }

    #[test]
    fn invalid_direct_projection_inputs_fail_fast() {
        assert!(compute_geometric_offset_contours(&[], 0.1).is_err());
        assert!(compute_geometric_offset_contours(&circle(1.0, 64, false), 0.0).is_err());
        assert!(compute_geometric_offset_contours(
            &[
                (0.0, 0.0, 1.0, 0.0),
                (1.0, 0.0, 1.0, 0.0),
                (f64::NAN, 1.0, 1.0, 0.0),
            ],
            0.1
        )
        .is_err());
        assert!(compute_geometric_offset_contours(
            &[
                (0.0, 0.0, 1.0, 0.0),
                (1.0, 0.0, 0.0, 0.0),
                (0.0, 1.0, 0.0, 1.0),
            ],
            0.1
        )
        .is_err());
    }

    #[test]
    fn projects_each_circle_sample_outward_by_epsilon() {
        let radius = 0.75;
        let epsilon = 0.2;
        let seed = circle(radius, 128, false);
        let result = compute_geometric_offset_contours(&seed, epsilon).unwrap();
        let component = &result.levels[0].boundary_components[0];

        assert_eq!(result.completed_levels, 1);
        assert_eq!(component.points.len(), seed.len());
        for ((source_x, source_y, _, _), projected) in seed.iter().zip(&component.points) {
            let displacement_x = projected.x - source_x;
            let displacement_y = projected.y - source_y;
            assert!((displacement_x.hypot(displacement_y) - epsilon).abs() < 1e-12);
            assert!((projected.nx.hypot(projected.ny) - 1.0).abs() < 1e-12);
            assert!(source_x * projected.nx + source_y * projected.ny > 0.74);
            assert!((projected.x.hypot(projected.y) - (radius + epsilon)).abs() < 1e-10);
        }
    }

    #[test]
    fn reversed_sample_order_still_projects_outward() {
        let radius = 0.5;
        let epsilon = 0.1;
        let seed = circle(radius, 96, true);
        let result = compute_geometric_offset_contours(&seed, epsilon).unwrap();
        let component = &result.levels[0].boundary_components[0];

        for ((source_x, source_y, _, _), projected) in seed.iter().zip(&component.points) {
            assert!(source_x * projected.nx + source_y * projected.ny > 0.49);
            assert!((projected.x.hypot(projected.y) - (radius + epsilon)).abs() < 1e-10);
        }
    }

    #[test]
    fn projection_uses_attached_normals_instead_of_polygon_bisectors() {
        let seed = [
            (-1.0, -1.0, -2.0, 0.0),
            (1.0, -1.0, 0.0, -3.0),
            (1.0, 1.0, 4.0, 0.0),
            (-1.0, 1.0, 0.0, 5.0),
        ];
        let result = compute_geometric_offset_contours(&seed, 0.5).unwrap();
        let points = &result.levels[0].boundary_components[0].points;

        assert_eq!(
            points[0],
            ExtendedBoundaryPoint {
                x: -1.5,
                y: -1.0,
                nx: -1.0,
                ny: 0.0
            }
        );
        assert_eq!(
            points[1],
            ExtendedBoundaryPoint {
                x: 1.0,
                y: -1.5,
                nx: 0.0,
                ny: -1.0
            }
        );
        assert_eq!(
            points[2],
            ExtendedBoundaryPoint {
                x: 1.5,
                y: 1.0,
                nx: 1.0,
                ny: 0.0
            }
        );
        assert_eq!(
            points[3],
            ExtendedBoundaryPoint {
                x: -1.0,
                y: 1.5,
                nx: 0.0,
                ny: 1.0
            }
        );
    }

    #[test]
    fn every_input_sample_has_exactly_one_projected_output() {
        let mut seed = circle(0.5, 32, false);
        seed.push(seed[0]);
        let result = compute_geometric_offset_contours(&seed, 0.1).unwrap();
        let component = &result.levels[0].boundary_components[0];
        assert_eq!(component.points.len(), seed.len());
        assert!(component.is_closed);
        for (source, projected) in seed.iter().zip(&component.points) {
            let normal_length = source.2.hypot(source.3);
            assert!((projected.x - (source.0 + 0.1 * source.2 / normal_length)).abs() < 1e-12);
            assert!((projected.y - (source.1 + 0.1 * source.3 / normal_length)).abs() < 1e-12);
        }
    }

    #[test]
    fn a_single_boundary_point_is_projected_without_curve_inference() {
        let result = compute_geometric_offset_contours(&[(1.0, 2.0, 0.0, 1.0)], 0.25).unwrap();
        let component = &result.levels[0].boundary_components[0];
        assert_eq!(component.points.len(), 1);
        assert_eq!(component.points[0].x, 1.0);
        assert_eq!(component.points[0].y, 2.25);
        assert!(!component.is_closed);
    }

    #[test]
    fn inverse_offset_curves_preserve_cyclic_components_and_unit_normals() {
        let mut closed_circle = circle(0.5, 128, false);
        closed_circle.push(closed_circle[0]);
        let offsets = compute_geometric_offset_contours(&closed_circle, 0.1).unwrap();
        let inverse = compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.4,
            0.3,
            0.1,
            2,
            1e-3,
            0.02,
            7,
        )
        .unwrap();

        assert_eq!(inverse.source_curve_count, 1);
        assert_eq!(inverse.completed_iterations, 2);
        assert_eq!(inverse.curves.len(), 2);
        assert!(inverse.total_output_points > 0);
        for curve in &inverse.curves {
            assert!(curve.points.len() >= 3);
            assert!(curve.closure_position_residual < 1e-12);
            assert!(curve.closure_normal_residual < 1e-12);
            assert!(curve.points.iter().all(|point| {
                [point.x, point.y, point.nx, point.ny]
                    .iter()
                    .all(|value| value.is_finite())
                    && (point.nx.hypot(point.ny) - 1.0).abs() < 1e-12
            }));
        }
    }

    #[test]
    fn open_inverse_offsets_refine_without_adding_a_closing_segment() {
        let offsets =
            compute_geometric_offset_contours(&[(0.2, 0.1, 1.0, 0.0), (0.4, 0.2, 0.0, 1.0)], 0.1)
                .unwrap();
        let position_tolerance = 0.02;
        let inverse = compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.4,
            0.3,
            0.1,
            2,
            position_tolerance,
            0.02,
            10,
        )
        .unwrap();

        assert_eq!(inverse.curves.len(), 2);
        assert_eq!(inverse.curves[0].input_point_count, 2);
        assert!(inverse.curves[0].output_point_count > inverse.curves[0].input_point_count);
        assert_eq!(
            inverse.curves[1].input_point_count,
            inverse.curves[0].output_point_count
        );
        for curve in &inverse.curves {
            assert!(!curve.is_closed);
            assert_eq!(
                curve.source_relation,
                InverseCurveSourceRelation::OpenPointSet
            );
            assert!(
                maximum_adjacent_position_gap(&curve.points, false) <= position_tolerance + 1e-12,
                "refined open curve exceeded its position tolerance"
            );
        }
    }

    #[test]
    fn inverse_offsets_clip_at_domain_and_only_propagate_surviving_points() {
        let levels = vec![GeometricOffsetLevel {
            level: 1,
            target_distance: 0.0,
            boundary_components: vec![BoundaryComponent {
                id: 0,
                points: vec![
                    ExtendedBoundaryPoint {
                        x: 0.0,
                        y: 0.0,
                        nx: 1.0,
                        ny: 0.0,
                    },
                    ExtendedBoundaryPoint {
                        x: 4.0,
                        y: 0.0,
                        nx: 1.0,
                        ny: 0.0,
                    },
                ],
                is_closed: false,
                is_hole: false,
                perimeter: 4.0,
                is_simple: true,
            }],
            component_count: 1,
        }];
        let bounds = PhaseSpaceBounds::try_new(-0.5, 0.5, -0.5, 0.5).unwrap();
        let inverse = compute_inverse_geometric_offset_contours_with_bounds(
            &levels, 0.0, 1.0, 0.0, 2, 0.1, 0.5, 8, bounds, 10_000,
        )
        .unwrap();

        assert!(!inverse.curves.is_empty());
        assert!(inverse
            .curves
            .iter()
            .flat_map(|curve| &curve.points)
            .all(|point| { bounds.contains(point.x, point.y) }));
        let first = &inverse.curves[0];
        assert!(!first.is_closed);
        assert!(first
            .points
            .iter()
            .any(|point| (point.y + 0.5).abs() < 1e-12));
        assert!(first
            .points
            .iter()
            .any(|point| (point.y - 0.5).abs() < 1e-12));
    }

    #[test]
    fn hundred_step_inverse_result_stays_within_transport_point_budget() {
        let point_count = 200;
        let points = (0..point_count)
            .map(|index| {
                let angle = std::f64::consts::TAU * index as f64 / point_count as f64;
                ExtendedBoundaryPoint {
                    x: 0.5 + 0.2 * angle.cos(),
                    y: -0.5 + 0.2 * angle.sin(),
                    nx: angle.cos(),
                    ny: angle.sin(),
                }
            })
            .collect::<Vec<_>>();
        let levels = vec![GeometricOffsetLevel {
            level: 1,
            target_distance: 0.0,
            boundary_components: vec![BoundaryComponent {
                id: 0,
                points,
                is_closed: true,
                is_hole: false,
                perimeter: std::f64::consts::TAU * 0.2,
                is_simple: true,
            }],
            component_count: 1,
        }];
        let bounds = PhaseSpaceBounds::try_new(-2.0, 2.0, -2.0, 2.0).unwrap();
        let point_budget = 1_000;
        let inverse = compute_inverse_geometric_offset_contours_with_bounds(
            &levels,
            0.0,
            -1.0,
            0.0,
            100,
            0.1,
            0.5,
            4,
            bounds,
            point_budget,
        )
        .unwrap();

        assert_eq!(inverse.completed_iterations, 100);
        assert_eq!(inverse.curves.len(), 100);
        assert!(inverse.total_output_points > inverse.retained_output_points);
        assert!(inverse.retained_output_points <= point_budget);
        assert_eq!(inverse.result_point_budget, point_budget);
        assert!(inverse.curves.iter().all(|curve| {
            !curve.points.is_empty()
                && curve.retained_point_count == curve.points.len()
                && curve.local_spacings.len() == curve.points.len()
                && curve.step_ratios.len() == curve.points.len()
                && curve.densities.len() == curve.points.len()
                && curve.display_decimated
        }));
    }

    #[test]
    fn source_midpoint_has_exact_chord_position_and_unit_angular_normal() {
        let midpoint = interpolate_extended_point(
            ExtendedBoundaryPoint {
                x: 0.0,
                y: -2.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: 2.0,
                y: 4.0,
                nx: 0.0,
                ny: 1.0,
            },
            0.5,
        );

        assert!((midpoint.x - 1.0).abs() < 1e-15);
        assert!((midpoint.y - 1.0).abs() < 1e-15);
        assert!((midpoint.nx - 2.0_f64.sqrt().recip()).abs() < 1e-15);
        assert!((midpoint.ny - 2.0_f64.sqrt().recip()).abs() < 1e-15);
        assert!((midpoint.nx.hypot(midpoint.ny) - 1.0).abs() < 1e-15);
    }

    #[test]
    fn inverse_refinement_maps_the_exact_source_midpoint() {
        let source = [
            ExtendedBoundaryPoint {
                x: 0.0,
                y: 0.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: 2.0,
                y: 0.0,
                nx: 1.0,
                ny: 0.0,
            },
        ];
        let settings = InverseSubdivisionSettings {
            a: 0.0,
            b: 1.0,
            epsilon: 0.0,
            position_tolerance: 1.1,
            normal_tolerance: 0.5,
            max_depth: 4,
            bounds: PhaseSpaceBounds::try_new(-10.0, 10.0, -10.0, 10.0).unwrap(),
        };
        let inverted = invert_offset_component(&source, false, &settings).unwrap();

        assert_eq!(inverted.refined_source.len(), 3);
        assert_eq!(inverted.mapped_output.len(), 3);
        assert_eq!(inverted.refined_source[1].x, 1.0);
        assert_eq!(inverted.refined_source[1].y, 0.0);
        assert!((inverted.mapped_output[1].x - 0.0).abs() < 1e-15);
        assert!((inverted.mapped_output[1].y - 0.0).abs() < 1e-15);
        assert!((inverted.mapped_output[1].nx - 0.0).abs() < 1e-15);
        assert!((inverted.mapped_output[1].ny - 1.0).abs() < 1e-15);
        assert!(!inverted.diagnostics.subdivision_limit_reached);
    }

    #[test]
    fn inverse_refinement_reports_an_unmet_tolerance_at_the_depth_limit() {
        let source = [
            ExtendedBoundaryPoint {
                x: 0.0,
                y: 0.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: 2.0,
                y: 0.0,
                nx: 1.0,
                ny: 0.0,
            },
        ];
        let settings = InverseSubdivisionSettings {
            a: 0.0,
            b: 1.0,
            epsilon: 0.0,
            position_tolerance: 0.5,
            normal_tolerance: 0.5,
            max_depth: 0,
            bounds: PhaseSpaceBounds::try_new(-10.0, 10.0, -10.0, 10.0).unwrap(),
        };
        let inverted = invert_offset_component(&source, false, &settings).unwrap();

        assert_eq!(inverted.mapped_output.len(), 2);
        assert!(maximum_adjacent_position_gap(&inverted.mapped_output, false) > 0.5);
        assert!(inverted.diagnostics.subdivision_limit_reached);
    }

    #[test]
    fn inverse_source_relation_distinguishes_nesting_crossing_and_contraction() {
        let source = square(-1.0, 1.0, -1.0, 1.0);
        let enclosing = square(-2.0, 2.0, -2.0, 2.0);
        let crossing = square(0.5, 2.0, -0.5, 0.5);
        let enclosed = square(-0.5, 0.5, -0.5, 0.5);

        assert_eq!(
            classify_inverse_source_relation(&source, &enclosing),
            InverseCurveSourceRelation::NestedOutside
        );
        assert_eq!(
            classify_inverse_source_relation(&source, &crossing),
            InverseCurveSourceRelation::CrossesSource
        );
        assert_eq!(
            classify_inverse_source_relation(&source, &enclosed),
            InverseCurveSourceRelation::SourceNotEnclosed
        );
    }

    #[test]
    fn inverse_source_relation_rejects_non_simple_curves() {
        let source = square(-1.0, 1.0, -1.0, 1.0);
        let bow_tie = vec![
            ExtendedBoundaryPoint {
                x: -2.0,
                y: -2.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: 2.0,
                y: 2.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: -2.0,
                y: 2.0,
                nx: 1.0,
                ny: 0.0,
            },
            ExtendedBoundaryPoint {
                x: 2.0,
                y: -2.0,
                nx: 1.0,
                ny: 0.0,
            },
        ];

        assert_eq!(
            classify_inverse_source_relation(&source, &bow_tie),
            InverseCurveSourceRelation::InverseNotSimple
        );
        assert_eq!(
            classify_inverse_source_relation(&bow_tie, &source),
            InverseCurveSourceRelation::SourceNotSimple
        );
    }

    #[test]
    fn inverse_offset_validation_fails_before_mapping() {
        let empty: Vec<GeometricOffsetLevel> = Vec::new();
        assert!(
            compute_inverse_geometric_offset_contours(&empty, 0.4, 0.3, 0.1, 1, 1e-3, 0.02, 6)
                .is_err()
        );

        let offsets = compute_geometric_offset_contours(&circle(0.5, 64, false), 0.1).unwrap();
        assert!(compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.4,
            0.0,
            0.1,
            1,
            1e-3,
            0.02,
            6
        )
        .is_err());
        assert!(compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.4,
            0.3,
            0.1,
            0,
            1e-3,
            0.02,
            6
        )
        .is_err());
        assert!(compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.4,
            0.3,
            0.1,
            101,
            1e-3,
            0.02,
            6
        )
        .is_err());
    }

    #[test]
    fn local_spacing_and_step_ratio_calculate_correct_expansion() {
        let closed_square = vec![
            Point2::new(0.0, 0.0),
            Point2::new(2.0, 0.0),
            Point2::new(2.0, 2.0),
            Point2::new(0.0, 2.0),
        ];
        let spacing_closed = local_spacing(&closed_square, true);
        assert_eq!(spacing_closed.len(), 4);
        for &s in &spacing_closed {
            // Distance across diagonal is sqrt(2^2 + 2^2) = sqrt(8) approx 2.8284.
            // Half is approx 1.4142.
            assert!((s - 2.0_f64.sqrt()).abs() < 1e-10);
        }

        let open_line = vec![
            Point2::new(0.0, 0.0),
            Point2::new(1.0, 0.0),
            Point2::new(3.0, 0.0),
        ];
        let spacing_open = local_spacing(&open_line, false);
        assert_eq!(spacing_open.len(), 3);
        assert!((spacing_open[0] - 1.0).abs() < 1e-10);
        assert!((spacing_open[1] - 1.5).abs() < 1e-10); // (3 - 0)/2 = 1.5
        assert!((spacing_open[2] - 2.0).abs() < 1e-10); // (3 - 1) = 2.0

        let ratios = step_ratio(&[1.0, 2.0, 4.0], &[2.0, 1.0, 4.0]);
        assert_eq!(ratios, vec![2.0, 0.5, 1.0]);
    }

    #[test]
    fn adaptive_inverse_mapping_grows_tracer_count_and_computes_aligned_densities() {
        let offsets = compute_geometric_offset_contours(&circle(0.5, 32, false), 0.1).unwrap();
        let position_tolerance = 0.05;
        let result = compute_inverse_geometric_offset_contours(
            &offsets.levels,
            0.0,
            1.0,
            0.05,
            4,
            position_tolerance,
            0.05,
            10,
        )
        .unwrap();

        assert_eq!(result.completed_iterations, 4);
        assert_eq!(result.curves.len(), 4);
        assert!(result.curves[0].points.len() > 32);
        assert_eq!(
            result.curves[1].input_point_count,
            result.curves[0].output_point_count
        );
        for curve in &result.curves {
            assert_eq!(curve.local_spacings.len(), curve.points.len());
            assert_eq!(curve.densities.len(), curve.points.len());
            assert_eq!(curve.step_ratios.len(), curve.points.len());
            assert!(
                maximum_adjacent_position_gap(&curve.points, curve.is_closed)
                    <= position_tolerance + 1e-12
            );
            for &density in &curve.densities {
                assert!(density > 0.0 && density.is_finite());
            }
        }
    }
}
