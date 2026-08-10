//! Sparse row-stochastic operators with unambiguous eigenvector semantics.

pub type SparseRow = Vec<(usize, f64)>;

#[derive(Clone, Debug)]
pub struct MarkovOperator {
    rows: Vec<SparseRow>,
}

impl MarkovOperator {
    pub fn try_new(rows: Vec<SparseRow>, row_sum_tolerance: f64) -> Result<Self, String> {
        if rows.is_empty() {
            return Err("A Markov operator requires at least one state".to_string());
        }
        if !row_sum_tolerance.is_finite() || row_sum_tolerance <= 0.0 {
            return Err("Row-sum tolerance must be positive and finite".to_string());
        }
        let size = rows.len();
        for (index, row) in rows.iter().enumerate() {
            if row.is_empty() {
                return Err(format!("Transition row {index} is empty"));
            }
            let mut sum = 0.0;
            for &(target, probability) in row {
                if target >= size {
                    return Err(format!(
                        "Transition row {index} targets state {target} outside 0..{size}"
                    ));
                }
                if !probability.is_finite() || probability < 0.0 {
                    return Err(format!("Transition row {index} has an invalid probability"));
                }
                sum += probability;
            }
            if (sum - 1.0).abs() > row_sum_tolerance {
                return Err(format!("Transition row {index} sums to {sum}, not one"));
            }
        }
        Ok(Self { rows })
    }

    pub fn size(&self) -> usize {
        self.rows.len()
    }

    pub fn rows(&self) -> &[SparseRow] {
        &self.rows
    }

    /// Left eigenvector `pi^T P = pi^T`, normalized as a probability density.
    pub fn stationary_density(
        &self,
        max_iterations: usize,
        tolerance: f64,
    ) -> Result<Vec<f64>, String> {
        validate_iteration(max_iterations, tolerance)?;
        let size = self.size();
        let mut density = vec![1.0 / size as f64; size];
        let mut next = vec![0.0; size];
        for _ in 0..max_iterations {
            next.fill(0.0);
            for (from, row) in self.rows.iter().enumerate() {
                for &(to, probability) in row {
                    next[to] += density[from] * probability;
                }
            }
            let mass: f64 = next.iter().sum();
            if mass <= f64::EPSILON {
                return Err("Stationary iteration lost all probability mass".to_string());
            }
            next.iter_mut().for_each(|value| *value /= mass);
            let residual = max_difference(&next, &density);
            density.copy_from_slice(&next);
            if residual <= tolerance {
                return Ok(density);
            }
        }
        Err(format!(
            "Stationary iteration did not converge within {max_iterations} steps"
        ))
    }

    /// Right eigenvector `P alpha = alpha` initialized from one invariant-set support.
    pub fn absorption_probabilities(
        &self,
        support: &[bool],
        max_iterations: usize,
        tolerance: f64,
    ) -> Result<Vec<f64>, String> {
        validate_iteration(max_iterations, tolerance)?;
        if support.len() != self.size() || !support.iter().any(|included| *included) {
            return Err("Absorption seed must select at least one operator state".to_string());
        }
        let mut alpha: Vec<f64> = support
            .iter()
            .map(|included| if *included { 1.0 } else { 0.0 })
            .collect();
        let mut next = vec![0.0; self.size()];
        for _ in 0..max_iterations {
            for (from, row) in self.rows.iter().enumerate() {
                next[from] = row
                    .iter()
                    .map(|(to, probability)| probability * alpha[*to])
                    .sum::<f64>()
                    .clamp(0.0, 1.0);
            }
            let residual = max_difference(&next, &alpha);
            alpha.copy_from_slice(&next);
            if residual <= tolerance {
                return Ok(alpha);
            }
        }
        Err(format!(
            "Absorption iteration did not converge within {max_iterations} steps"
        ))
    }

    pub fn stationary_residual(&self, density: &[f64]) -> Result<f64, String> {
        if density.len() != self.size() {
            return Err("Stationary vector length does not match operator size".to_string());
        }
        let mut image = vec![0.0; self.size()];
        for (from, row) in self.rows.iter().enumerate() {
            for &(to, probability) in row {
                image[to] += density[from] * probability;
            }
        }
        Ok(max_difference(&image, density))
    }

    pub fn absorption_residual(&self, alpha: &[f64]) -> Result<f64, String> {
        if alpha.len() != self.size() {
            return Err("Absorption vector length does not match operator size".to_string());
        }
        let image: Vec<f64> = self
            .rows
            .iter()
            .map(|row| {
                row.iter()
                    .map(|(to, probability)| probability * alpha[*to])
                    .sum()
            })
            .collect();
        Ok(max_difference(&image, alpha))
    }
}

fn validate_iteration(max_iterations: usize, tolerance: f64) -> Result<(), String> {
    if max_iterations == 0 {
        return Err("Power iteration requires at least one step".to_string());
    }
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err("Power-iteration tolerance must be positive and finite".to_string());
    }
    Ok(())
}

fn max_difference(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f64::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stationary_density_is_the_left_eigenvector() {
        let operator = MarkovOperator::try_new(
            vec![vec![(0, 0.5), (1, 0.5)], vec![(0, 0.25), (1, 0.75)]],
            1e-14,
        )
        .unwrap();
        let density = operator.stationary_density(1_000, 1e-14).unwrap();
        assert!((density[0] - 1.0 / 3.0).abs() < 1e-12);
        assert!((density[1] - 2.0 / 3.0).abs() < 1e-12);
        assert!(operator.stationary_residual(&density).unwrap() < 1e-13);
    }

    #[test]
    fn support_seed_selects_the_corresponding_absorption_problem() {
        let operator = MarkovOperator::try_new(
            vec![vec![(0, 1.0)], vec![(0, 0.5), (1, 0.5)], vec![(2, 1.0)]],
            1e-14,
        )
        .unwrap();
        let alpha = operator
            .absorption_probabilities(&[true, false, false], 1_000, 1e-14)
            .unwrap();
        assert!((alpha[0] - 1.0).abs() < 1e-14);
        assert!((alpha[1] - 1.0).abs() < 1e-12);
        assert_eq!(alpha[2], 0.0);
        assert!(operator.absorption_residual(&alpha).unwrap() < 1e-13);
    }
}
