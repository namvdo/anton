use serde::{Deserialize, Serialize};

pub const RANGE_LIMIT: f64 = 10.0;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct PhaseSpaceBounds {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
}

impl PhaseSpaceBounds {
    pub fn try_new(x_min: f64, x_max: f64, y_min: f64, y_max: f64) -> Result<Self, String> {
        if ![x_min, x_max, y_min, y_max].iter().all(|v| v.is_finite()) {
            return Err("Phase-space bounds must be finite".to_string());
        }
        if x_min >= x_max {
            return Err("Phase-space x_min must be smaller than x_max".to_string());
        }
        if y_min >= y_max {
            return Err("Phase-space y_min must be smaller than y_max".to_string());
        }
        if [x_min, x_max, y_min, y_max]
            .iter()
            .any(|v| v.abs() > RANGE_LIMIT)
        {
            return Err(format!(
                "Phase-space bounds must remain within ±{}",
                RANGE_LIMIT
            ));
        }
        Ok(Self {
            x_min,
            x_max,
            y_min,
            y_max,
        })
    }
}

pub fn clamp_pair(min_val: f64, max_val: f64, limit: f64) -> (f64, f64) {
    let mut lo = min_val.min(max_val);
    let mut hi = min_val.max(max_val);

    lo = lo.clamp(-limit, limit);
    hi = hi.clamp(-limit, limit);

    if (hi - lo).abs() < 1e-9 {
        let center = (hi + lo) / 2.0;
        let mut new_lo = center - 1.0;
        let mut new_hi = center + 1.0;
        new_lo = new_lo.clamp(-limit, limit);
        new_hi = new_hi.clamp(-limit, limit);
        if (new_hi - new_lo).abs() < 1e-9 {
            new_lo = (-limit).min(new_lo);
            new_hi = (limit).max(new_hi);
        }
        lo = new_lo;
        hi = new_hi;
    }

    (lo, hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clamp_pair_reorders() {
        let (lo, hi) = clamp_pair(3.0, -2.0, RANGE_LIMIT);
        assert_eq!(lo, -2.0);
        assert_eq!(hi, 3.0);
    }

    #[test]
    fn test_clamp_pair_limits() {
        let (lo, hi) = clamp_pair(-20.0, 5.0, RANGE_LIMIT);
        assert_eq!(lo, -10.0);
        assert_eq!(hi, 5.0);
    }

    #[test]
    fn test_clamp_pair_expands_zero_width() {
        let (lo, hi) = clamp_pair(2.0, 2.0, RANGE_LIMIT);
        assert!(hi > lo);
    }

    #[test]
    fn phase_space_bounds_fail_fast() {
        assert!(PhaseSpaceBounds::try_new(-2.0, 2.0, -1.5, 1.5).is_ok());
        assert!(PhaseSpaceBounds::try_new(2.0, -2.0, -1.5, 1.5).is_err());
        assert!(PhaseSpaceBounds::try_new(f64::NAN, 2.0, -1.5, 1.5).is_err());
    }
}
