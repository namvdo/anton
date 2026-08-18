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

/// Return the closed communicating classes of a finite transition graph.
///
/// Each returned component is strongly connected and has no edge to another
/// component. Empty transition rows represent escape from the computation
/// domain and are deliberately excluded from the result.
pub fn terminal_strongly_connected_components(
    adjacency: &[Vec<usize>],
) -> Result<Vec<Vec<usize>>, String> {
    if adjacency.is_empty() {
        return Err("A transition graph requires at least one state".to_string());
    }
    let size = adjacency.len();
    for (source, targets) in adjacency.iter().enumerate() {
        if let Some(target) = targets.iter().find(|target| **target >= size) {
            return Err(format!(
                "Transition state {source} targets {target} outside 0..{size}"
            ));
        }
    }

    // Iterative Kosaraju passes avoid recursion-depth failures on fine grids.
    let mut reverse = vec![Vec::new(); size];
    for (source, targets) in adjacency.iter().enumerate() {
        for &target in targets {
            reverse[target].push(source);
        }
    }
    let mut visited = vec![false; size];
    let mut finishing_order = Vec::with_capacity(size);
    for start in 0..size {
        if visited[start] {
            continue;
        }
        visited[start] = true;
        let mut stack = vec![(start, 0usize)];
        while let Some((node, next_target)) = stack.pop() {
            if next_target < adjacency[node].len() {
                stack.push((node, next_target + 1));
                let target = adjacency[node][next_target];
                if !visited[target] {
                    visited[target] = true;
                    stack.push((target, 0));
                }
            } else {
                finishing_order.push(node);
            }
        }
    }

    let mut component_id = vec![usize::MAX; size];
    let mut components = Vec::<Vec<usize>>::new();
    for &start in finishing_order.iter().rev() {
        if component_id[start] != usize::MAX {
            continue;
        }
        let id = components.len();
        let mut members = Vec::new();
        let mut queue = VecDeque::from([start]);
        component_id[start] = id;
        while let Some(node) = queue.pop_front() {
            members.push(node);
            for &predecessor in &reverse[node] {
                if component_id[predecessor] == usize::MAX {
                    component_id[predecessor] = id;
                    queue.push_back(predecessor);
                }
            }
        }
        members.sort_unstable();
        components.push(members);
    }

    let mut terminal = vec![true; components.len()];
    let mut has_transition = vec![false; components.len()];
    for (source, targets) in adjacency.iter().enumerate() {
        let source_component = component_id[source];
        has_transition[source_component] |= !targets.is_empty();
        if targets
            .iter()
            .any(|target| component_id[*target] != source_component)
        {
            terminal[source_component] = false;
        }
    }
    let mut result: Vec<_> = components
        .into_iter()
        .enumerate()
        .filter_map(|(id, members)| (terminal[id] && has_transition[id]).then_some(members))
        .collect();
    result.sort_by_key(|members| members[0]);
    Ok(result)
}

/// Grid boxes on the four-neighbour boundary of a mask.
pub fn boundary_mask(mask: &[bool], dims: (usize, usize)) -> Result<Vec<bool>, String> {
    component_count(mask, dims)?;
    let mut boundary = vec![false; mask.len()];
    for index in 0..mask.len() {
        if !mask[index] {
            continue;
        }
        let x = index % dims.0;
        let y = index / dims.0;
        boundary[index] = x == 0
            || x + 1 == dims.0
            || y == 0
            || y + 1 == dims.1
            || !mask[index - 1]
            || !mask[index + 1]
            || !mask[index - dims.0]
            || !mask[index + dims.0];
    }
    Ok(boundary)
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

    #[test]
    fn terminal_components_exclude_escape_rows_and_transient_cycles() {
        let graph = vec![vec![1], vec![0, 2], vec![2], vec![4], vec![3], vec![]];
        let components = terminal_strongly_connected_components(&graph).unwrap();
        assert_eq!(components, vec![vec![2], vec![3, 4]]);
    }

    #[test]
    fn boundary_mask_keeps_only_exposed_cells() {
        let mask = vec![true; 9];
        assert_eq!(
            boundary_mask(&mask, (3, 3)).unwrap(),
            vec![true, true, true, true, false, true, true, true, true]
        );
    }
}
