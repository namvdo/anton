use nalgebra::ComplexField;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{henon_extended_map::{inverse_henon_extended_point, HenonExtendedPoint}, ExtendedBoundaryPoint};

const NORMAL_EPSILON: f64 = 1e-14;
const MAX_INVERSE_CURVE_POINTS: usize = 250_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Orientation {
    Clockwise,
    CounterClockwise
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundaryComponent {
    pub id: usize,
    pub points: Vec<ExtendedBoundaryPoint>,
    pub orientation: Orientation,
    pub is_hole: bool,
    pub signed_area: f64,
    pub perimeter: f64,
    pub is_simple: bool
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeometricOffsetStopReason {
    RequestedLevelsCompleted
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometricOffsetLevel {
    pub level: usize,
    pub target_distance: f64,
    pub boundary_components: Vec<BoundaryComponent>,
    pub area: f64,
    pub component_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InverseOffsetCurve {
    pub source_level: usize,
    pub source_component_id: usize,
    pub inverse_iteration: usize,
    pub is_hole: bool,
    pub points: Vec<ExtendedBoundaryPoint>,
    pub input_point_count: usize,
    pub output_point_count: usize,
    pub closure_position_residual: f64,
    pub closure_normal_residual: f64,
    pub max_position_chord_error: f64,
    pub subdivision_limit_reached: bool,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometricOffsetResult {
    pub levels: Vec<GeometricOffsetLevel>,
    pub completed_levels: usize,
    pub epsilon: f64,
    pub stop_reason: GeometricOffsetStopReason,
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
    y: f64
}

impl Point2 {
    fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    fn distance(self, other: Self) -> f64 {
        (self.x - other.x).hypot(self.y - other.y)
    }


}

fn signed_area(points: &[Point2]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }

    let mut sum = 0.0;
    for index in 0..points.len() {
        let current = points[index];
        let next = points[(index + 1) % points.len()];
        sum += current.x * next.y  - next.x * current.y;
    }
    0.5 * sum
}

fn perimeter(points: &[Point2]) -> f64 {
    (0..points.len())
        .map(|index| points[index].distance(points[(index + 1) % points.len()]))
        .sum()
}

fn orientation(area: f64) -> Orientation {
    if area >= 0.0 {
        Orientation::CounterClockwise
    } else {
        Orientation::Clockwise
    }
}

fn cross(a: Point2, b: Point2, c: Point2) -> f64 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

fn segment_intersect(a: Point2, b: Point2, c: Point2, d: Point2) -> bool {
    let (ab_c, ab_d, cd_a, cd_b) = (
        cross(a, b, c),
        cross(a, b, d),
        cross(c, d, a),
        cross(c, d, b),
    );
    ab_c * ab_d < 1e-12 && cd_a * cd_b < -1e-12
}

fn has_self_intersection(points: &[Point2]) -> bool {
    if points.len() > 6000 {
        return true;
    }

    for left in 0..points.len() {
        for right in left + 1..points.len() {
            if right == left || right == (left + 1) % points.len() || left == (right + 1) % points.len() {
                    continue;
            }
            if segment_intersect(points[left], points[(left + 1) % points.len()],
                    points[right], points[(right + 1) % points.len()]) {
                        return true;
            }   
        }
    }
    false
}


fn normalize_vector(x: f64, y: f64, context: &str) -> Result<(f64, f64), String> {
    let length = x.hypot(y);
    if !length.is_finite() || length < NORMAL_EPSILON {
        return Err(format!("{context} produced a degenerate direction"))
    }
    Ok((x / length, y / length))
}

fn clean_seed(seed: &[(f64, f64)]) -> Result<Vec<Point2>, String> {
    if seed.len() < 3 {
        return Err("MIS boundary seed needs at least three points".to_string());
    }

    let mut points = Vec::with_capacity(seed.len());

    for &(x, y) in seed {
        if !x.is_finite() || !y.is_finite() {
            return Err("MIS boundary seed contains non-finite points".to_string());
        }
        let point = Point2::new(x, y);
        if points.last().map_or(true, |previous: &Point2| {
            previous.distance(point) > NORMAL_EPSILON
        }) {
            points.push(point);
        }
    }

    if points
        .first()
        .zip(points.last())
        .is_some_and(|(first, last)| first.distance(*last) <= NORMAL_EPSILON) {
            points.pop();
    }

    if points.len() < 3 {
        return Err("MIS boundary seed needs at least three distinct points".to_string());
    }

    if signed_area(&points).abs() < NORMAL_EPSILON {
        return Err("MIS boundary seed has degenerate signed area".to_string());
    }

    Ok(points)
}


fn outward_edge_normal(
    start: Point2,
    end: Point2, 
    counter_clockwise: bool,
) -> Result<(f64, f64), String> {
    let (tx, ty) = normalize_vector(end.x - start.x, end.y - start.y, "MIS boundary edge")?;
    Ok(if counter_clockwise {
        (ty, -tx)
    } else {
        (-ty, tx)
    })
}


// estimate outward normal at one polygon vertex by averaging outward normals of its incoming 
// and outgoing edges, this is the standard vertex normal for a sampled oriented polygon.
fn outward_vertex_normal(previous: Point2, current: Point2, next: Point2, counter_clockwise: bool) -> Result<(f64, f64), String> {
    let incoming = outward_edge_normal(previous, current, counter_clockwise)?;
    let outgoing = outward_edge_normal(current, next, counter_clockwise)?;
    let sum_x = incoming.0 + outgoing.0;
    let sum_y = incoming.1 + outgoing.1;

    if sum_x.hypot(sum_y) >= NORMAL_EPSILON {
        normalize_vector(sum_x, sum_y, "MIS boundary vertext normal")
    } else {
        // 180-degree reversal has no unique bisector. using outgoing edge normal keeps 
        // the construction deterministic

        Ok(outgoing)
    }
}

fn direct_normal_projection(seed: &[Point2], epsilon: f64) -> Result<BoundaryComponent, String> {
    let seed_area = signed_area(seed);
    let counter_clockwise = seed_area > 0.0;
    let mut points = Vec::with_capacity(seed.len());
    let mut projected_position = Vec::with_capacity(seed.len());

    for index in 0..seed.len() {
        let previous = seed[(index + seed.len() - 1) % seed.len()];
        let current = seed[index];
        let next = seed[(index + 1) % seed.len()];
        let (nx, ny) = outward_vertex_normal(previous, current, next, counter_clockwise)?;
        let projected = Point2::new(current.x + epsilon * nx, current.y + epsilon * ny);
        if !projected.x.is_finite() || !projected.y.is_finite() {
            return Err("Direct normal projection produced non-finite point".to_string());
        } 
        projected_position.push(projected);
        points.push(ExtendedBoundaryPoint {
            x: projected.x,
            y: projected.y,
            nx, 
            ny
        });
    }

    let projected_area = signed_area(&projected_position);
    Ok(BoundaryComponent {
        id: 0,
        points,
        orientation: orientation(projected_area),
        is_hole: false,
        signed_area: projected_area,
        perimeter: perimeter(&projected_position),
        is_simple: !has_self_intersection(&projected_position)
    })
}


// construct one closed offset polygon by projecting every MIS boundary
// sample exactly `epsilon` along its estimated outward unit normal.
pub fn compute_geometric_offset_contours(seed: &[(f64, f64)], epsilon: f64) -> Result<GeometricOffsetResult, String> {
    if !epsilon.is_finite() || epsilon <= 0.0 {
        return Err("Geometric offset distance must be positive and finite".to_string());
    }

    let seed = clean_seed(seed)?;
    let component = direct_normal_projection(&seed, epsilon)?;
    let area = component.signed_area.abs();
    let level = GeometricOffsetLevel {
        level: 1,
        target_distance: epsilon,
        boundary_components: vec![component],
        area,
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
        ny: theta.sin() 
    }
}

fn inverse_offset_point(
    point: ExtendedBoundaryPoint,
    a: f64,
    b: f64,
    epsilon: f64
) -> Result<ExtendedBoundaryPoint, String> {
    let mapped = inverse_henon_extended_point(
        HenonExtendedPoint {
            x: point.x,
            y: point.y,
            nx: point.nx,
            ny: point.ny
        },
        a,
        b,
        epsilon
    )?;

    Ok(ExtendedBoundaryPoint {
        x: mapped.x,
        y: mapped.y,
        nx: mapped.nx,
        ny: mapped.ny
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
    max_depth: usize
}

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
    let source_mid_point = interpolate_extended_point(source_left, source_right, 0.5);
    let mapped_midpoint = inverse_offset_point(
        source_mid_point, settings.a, settings.b, settings.epsilon
    )?;

    let chord_midpoint_x = 0.5 * (mapped_left.x + mapped_right.x);
    let chord_midpoint_y = 0.5 * (mapped_left.y + mapped_right.y);

    let position_error = 
        (mapped_midpoint.x - chord_midpoint_x).hypot(mapped_midpoint.y - chord_midpoint_y);
    
    let left_theta = mapped_left.ny.atan2(mapped_left.nx);
    let right_theta = mapped_right.ny.atan2(mapped_right.nx);

    let chord_midpoint_theta = left_theta * 0.5 * circular_difference(right_theta, left_theta);
    let mapped_midpoint_theta = mapped_midpoint.ny.atan2(mapped_midpoint.nx);
    let normal_error = circular_difference(mapped_midpoint_theta, chord_midpoint_theta).abs();
    
    let requires_subdivision = 
        position_error > settings.position_tolerance || normal_error > settings.normal_tolerance;
    
    if requires_subdivision && depth < settings.max_depth {
        append_inverse_segment(
            source_left,
            source_mid_point,
            mapped_left,
            mapped_midpoint,
            depth + 1,
            settings,
            diagnostics,
            output
        )?;

        append_inverse_segment(
            source_mid_point,
            source_right,
            mapped_midpoint,
            mapped_right,
            depth + 1,
        settings,
        diagnostics,
        output
        )?;

        return Ok(());
    }


    diagnostics.max_position_chord_error = diagnostics.max_position_chord_error.max(position_error);
    diagnostics.max_normal_chord_error = diagnostics.max_normal_chord_error.max(normal_error);
    diagnostics.subdivision_limit_reached |= requires_subdivision;
    if output.len() >= MAX_INVERSE_CURVE_POINTS {
        return Err(format!(
            "Inverse offset curve exceeds the {MAX_INVERSE_CURVE_POINTS}-point safety limit"
        ));
    }

    output.push(mapped_right);
    Ok(())


}


fn inverse_offset_component(source: &[ExtendedBoundaryPoint], settings: &InverseSubdivisionSettings) -> Result<
    (
        Vec<ExtendedBoundaryPoint>,
        f64,
        f64,
        InverseSubdivisionDiagnostics
    ), String
>{
    if source.len() < 3 {
        return Err("An inverse offset component requires at least three points".to_string());
    }
    let mapped_first = inverse_offset_point(source[0], settings.a, settings.b, settings.epsilon)?;
    let mut output = Vec::with_capacity(source.len());
    output.push(mapped_first);
    let mut diagnostics = InverseSubdivisionDiagnostics::default();
    for index in 0..source.len() {
        let next_index = (index + 1) % source.len() ;
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

    let repeated_first = output.pop()
        .ok_or("Inverse offset component unexpectedly became empty")?;
    let closure_position_residual = 
        (repeated_first.x - mapped_first.x).hypot(repeated_first.y - mapped_first.y);
    let closure_normal_residual = circular_difference(
        repeated_first.ny.atan2(repeated_first.nx),
        mapped_first.ny.atan2(mapped_first.nx)
    ).abs();
    Ok((
        output,
        closure_position_residual,
        closure_normal_residual,
        diagnostics
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
    max_subdivision_depth: usize
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
        max_depth: max_subdivision_depth
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
            for inverse_iteration in 1..=iterations {
                let input_point_count = source_points.len();
                let (points, closure_position_residual, closure_normal_residual, diagnostics) 
                = inverse_offset_component(&source_points, &settings)?;
                total_output_points = total_output_points
                    .checked_add(points.len())
                    .ok_or("Inverse offset point count overflow")?;
                if total_output_points > MAX_INVERSE_CURVE_POINTS {
                    return Err(format!(
                        "Inverse offset result exceeds the {MAX_INVERSE_CURVE_POINTS}-point safety limit"
                    ))
                }
                global_position_error = 
                    global_position_error.max(diagnostics.max_position_chord_error);
                global_normal_error = 
                    global_normal_error.max(diagnostics.max_normal_chord_error);
                
                any_limit_reached |= diagnostics.subdivision_limit_reached;
                curves.push(InverseOffsetCurve {
                    source_level
                })
            }
        }
    }
}