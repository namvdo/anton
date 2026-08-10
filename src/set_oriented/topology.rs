//! Grid diagnostics for MIS/dual-repeller collision and component changes.

use std::collections::VecDeque;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TopologicalEvidence {
    pub invariant_components_before: usize,
    pub invariant_components_after: usize,
    pub collision_boxes_at_transition: usize,
}

impl TopologicalEvidence {
    /// Numerical evidence for the necessary collision condition together with
    /// a change in the number of connected invariant-set components.
    pub fn supports_component_bifurcation(&self) -> bool {
        self.collision_boxes_at_transition > 0
            && self.invariant_components_before != self.invariant_components_after
    }
}

pub fn threshold_stationary_support(
    stationary_density: &[f64],
    threshold: f64,
) -> Result<Vec<bool>, String> {
    validate_threshold(threshold)?;
    if stationary_density
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err("Stationary density must be finite and nonnegative".to_string());
    }
    Ok(stationary_density
        .iter()
        .map(|value| *value > threshold)
        .collect())
}

pub fn threshold_dual_repeller(
    absorption_probabilities: &[f64],
    deficit_threshold: f64,
) -> Result<Vec<bool>, String> {
    validate_threshold(deficit_threshold)?;
    if absorption_probabilities
        .iter()
        .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err("Absorption probabilities must lie in [0,1]".to_string());
    }
    Ok(absorption_probabilities
        .iter()
        .map(|value| *value < 1.0 - deficit_threshold)
        .collect())
}

pub fn overlap_count(left: &[bool], right: &[bool]) -> Result<usize, String> {
    if left.len() != right.len() {
        return Err("Masks must have the same length".to_string());
    }
    Ok(left.iter().zip(right).filter(|(a, b)| **a && **b).count())
}

/// Four-neighbour component count for a rectangular Ulam grid.
pub fn component_count(mask: &[bool], dims: (usize, usize)) -> Result<usize, String> {
    if dims.0 == 0 || dims.1 == 0 || dims.0.checked_mul(dims.1) != Some(mask.len()) {
        return Err("Mask length must match positive rectangular grid dimensions".to_string());
    }
    let mut visited = vec![false; mask.len()];
    let mut components = 0;
    for start in 0..mask.len() {
        if !mask[start] || visited[start] {
            continue;
        }
        components += 1;
        visited[start] = true;
        let mut queue = VecDeque::from([start]);
        while let Some(index) = queue.pop_front() {
            let x = index % dims.0;
            let y = index / dims.0;
            if x > 0 {
                visit(index - 1, mask, &mut visited, &mut queue);
            }
            if x + 1 < dims.0 {
                visit(index + 1, mask, &mut visited, &mut queue);
            }
            if y > 0 {
                visit(index - dims.0, mask, &mut visited, &mut queue);
            }
            if y + 1 < dims.1 {
                visit(index + dims.0, mask, &mut visited, &mut queue);
            }
        }
    }
    Ok(components)
}

fn visit(index: usize, mask: &[bool], visited: &mut [bool], queue: &mut VecDeque<usize>) {
    if mask[index] && !visited[index] {
        visited[index] = true;
        queue.push_back(index);
    }
}

fn validate_threshold(threshold: f64) -> Result<(), String> {
    if !threshold.is_finite() || !(0.0..1.0).contains(&threshold) {
        return Err("Threshold must be finite and lie in [0,1)".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_two_components_and_collision_evidence() {
        let before = vec![true, true, true, true, false, false];
        let after = vec![true, false, true, true, false, true];
        let dual = vec![false, false, false, true, false, false];
        let evidence = TopologicalEvidence {
            invariant_components_before: component_count(&before, (3, 2)).unwrap(),
            invariant_components_after: component_count(&after, (3, 2)).unwrap(),
            collision_boxes_at_transition: overlap_count(&after, &dual).unwrap(),
        };
        assert_eq!(evidence.invariant_components_before, 1);
        assert_eq!(evidence.invariant_components_after, 2);
        assert!(evidence.supports_component_bifurcation());
    }

    #[test]
    fn collision_alone_is_not_reported_as_a_component_bifurcation() {
        let evidence = TopologicalEvidence {
            invariant_components_before: 1,
            invariant_components_after: 1,
            collision_boxes_at_transition: 2,
        };
        assert!(!evidence.supports_component_bifurcation());
    }
}
