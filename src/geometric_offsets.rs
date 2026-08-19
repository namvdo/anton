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

const NORMAL_EPSILON: f64 = 1e-14;

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
    pub perimeter: f64,
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
    pub closure_position_residual: f64,
    pub closure_normal_residual: f64,
    pub max_position_chord_error: f64,
    pub max_normal_chord_error: f64,
    pub subdivision_limit_reached: bool,
    pub source_relation: InverseCurveSourceRelation,
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
    pub max_position_chord_error: f64,
    pub max_normal_chord_error: f64,
    pub subdivision_limit_reached: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Point2 {
    x: f64,
    y: f64,
}

impl Point2 {
    fn new(x: f64, y: f64) -> Self {
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
}

/// Adaptively sample the inverse image of one source-curve segment.
///
/// The caller has already stored the mapped left endpoint. Each accepted leaf
/// appends only its mapped right endpoint, so left-first recursion preserves
/// curve order without duplicating shared endpo  ints.
fn append_inverse_segment(
    source_left: ExtendedBoundaryPoint,
    source_right: ExtendedBoundaryPoint,
    mapped_left: ExtendedBoundaryPoint,
    mapped_right: ExtendedBoundaryPoint,
    depth: usize,
    settings: &InverseSubdivisionSettings,
    diagnostics: &mut InverseSubdivisionDiagnostics,
    output: &mut Vec<ExtendedBoundaryPoint>,
) -> Result<(), String> {
    let source_midpoint = interpolate_extended_point(source_left, source_right, 0.5);
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
    let requires_subdivision =
        position_error > settings.position_tolerance || normal_error > settings.normal_tolerance;

    if requires_subdivision && depth < settings.max_depth {
        append_inverse_segment(
            source_left,
            source_midpoint,
            mapped_left,
            mapped_midpoint,
            depth + 1,
            settings,
            diagnostics,
            output,
        )?;
        append_inverse_segment(
            source_midpoint,
            source_right,
            mapped_midpoint,
            mapped_right,
            depth + 1,
            settings,
            diagnostics,
            output,
        )?;
        return Ok(());
    }

    diagnostics.max_position_chord_error = diagnostics.max_position_chord_error.max(position_error);
    diagnostics.max_normal_chord_error = diagnostics.max_normal_chord_error.max(normal_error);
    diagnostics.subdivision_limit_reached |= requires_subdivision;
    output.push(mapped_right);
    Ok(())
}

fn invert_offset_component(
    source: &[ExtendedBoundaryPoint],
    settings: &InverseSubdivisionSettings,
) -> Result<
    (
        Vec<ExtendedBoundaryPoint>,
        f64,
        f64,
        InverseSubdivisionDiagnostics,
    ),
    String,
> {
    if source.len() < 3 {
        return Err("An inverse offset component requires at least three points".to_string());
    }
    let mapped_first = inverse_offset_point(source[0], settings.a, settings.b, settings.epsilon)?;
    let mut output = Vec::with_capacity(source.len());
    output.push(mapped_first);
    let mut diagnostics = InverseSubdivisionDiagnostics::default();
    for index in 0..source.len() {
        let next_index = (index + 1) % source.len();
        let mapped_left =
            inverse_offset_point(source[index], settings.a, settings.b, settings.epsilon)?;
        let mapped_right = if next_index == 0 {
            mapped_first
        } else {
            inverse_offset_point(source[next_index], settings.a, settings.b, settings.epsilon)?
        };
        append_inverse_segment(
            source[index],
            source[next_index],
            mapped_left,
            mapped_right,
            0,
            settings,
            &mut diagnostics,
            &mut output,
        )?;
    }

    let repeated_first = output
        .pop()
        .ok_or("Inverse offset component unexpectedly became empty")?;
    let closure_position_residual =
        (repeated_first.x - mapped_first.x).hypot(repeated_first.y - mapped_first.y);
    let closure_normal_residual = circular_difference(
        repeated_first.ny.atan2(repeated_first.nx),
        mapped_first.ny.atan2(mapped_first.nx),
    )
    .abs();
    Ok((
        output,
        closure_position_residual,
        closure_normal_residual,
        diagnostics,
    ))
}

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
    if levels.is_empty() {
        return Err("Compute geometric offset contours before their inverse images".to_string());
    }
    if iterations == 0 || iterations > 8 {
        return Err("Inverse offset iterations must lie between 1 and 8".to_string());
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

    let settings = InverseSubdivisionSettings {
        a,
        b,
        epsilon,
        position_tolerance,
        normal_tolerance,
        max_depth: max_subdivision_depth,
    };
    let source_curve_count = levels
        .iter()
        .map(|level| level.boundary_components.len())
        .sum();
    let mut curves = Vec::with_capacity(source_curve_count * iterations);
    let mut total_output_points = 0usize;
    let mut global_position_error: f64 = 0.0;
    let mut global_normal_error: f64 = 0.0;
    let mut any_limit_reached = false;

    for level in levels {
        for component in &level.boundary_components {
            let mut source_points = component.points.clone();
            if component.is_closed && source_points.first() == source_points.last() {
                source_points.pop();
            }
            for inverse_iteration in 1..=iterations {
                let input_point_count = source_points.len();
                let (points, closure_position_residual, closure_normal_residual, diagnostics) =
                    if component.is_closed {
                        invert_offset_component(&source_points, &settings)?
                    } else {
                        let points = source_points
                            .iter()
                            .copied()
                            .map(|point| inverse_offset_point(point, a, b, epsilon))
                            .collect::<Result<Vec<_>, _>>()?;
                        (points, 0.0, 0.0, InverseSubdivisionDiagnostics::default())
                    };
                let source_relation = if component.is_closed {
                    classify_inverse_source_relation(&source_points, &points)
                } else {
                    InverseCurveSourceRelation::OpenPointSet
                };
                total_output_points = total_output_points
                    .checked_add(points.len())
                    .ok_or("Inverse offset point count overflow")?;
                global_position_error =
                    global_position_error.max(diagnostics.max_position_chord_error);
                global_normal_error = global_normal_error.max(diagnostics.max_normal_chord_error);
                any_limit_reached |= diagnostics.subdivision_limit_reached;
                curves.push(InverseOffsetCurve {
                    source_level: level.level,
                    source_component_id: component.id,
                    inverse_iteration,
                    is_closed: component.is_closed,
                    is_hole: component.is_hole,
                    input_point_count,
                    output_point_count: points.len(),
                    points: points.clone(),
                    closure_position_residual,
                    closure_normal_residual,
                    max_position_chord_error: diagnostics.max_position_chord_error,
                    max_normal_chord_error: diagnostics.max_normal_chord_error,
                    subdivision_limit_reached: diagnostics.subdivision_limit_reached,
                    source_relation,
                });
                source_points = points;
            }
        }
    }

    Ok(InverseOffsetResult {
        curves,
        source_curve_count,
        completed_iterations: iterations,
        total_output_points,
        max_position_chord_error: global_position_error,
        max_normal_chord_error: global_normal_error,
        subdivision_limit_reached: any_limit_reached,
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
) -> Result<JsValue, JsValue> {
    let levels: Vec<GeometricOffsetLevel> = serde_wasm_bindgen::from_value(levels_js)
        .map_err(|error| JsValue::from_str(&format!("Invalid geometric offset levels: {error}")))?;
    let result = compute_inverse_geometric_offset_contours(
        &levels,
        a,
        b,
        epsilon,
        iterations,
        position_tolerance,
        normal_tolerance,
        max_subdivision_depth,
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
    fn open_inverse_offsets_preserve_point_correspondence_without_closure() {
        let offsets =
            compute_geometric_offset_contours(&[(0.2, 0.1, 1.0, 0.0), (0.4, 0.2, 0.0, 1.0)], 0.1)
                .unwrap();
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

        assert_eq!(inverse.curves.len(), 2);
        assert!(inverse.curves.iter().all(|curve| {
            !curve.is_closed
                && curve.input_point_count == 2
                && curve.output_point_count == 2
                && curve.source_relation == InverseCurveSourceRelation::OpenPointSet
        }));
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
    }
}
