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

    #[inline]
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x.is_finite()
            && y.is_finite()
            && x >= self.x_min
            && x <= self.x_max
            && y >= self.y_min
            && y <= self.y_max
    }

    #[inline]
    pub fn same_exterior_half_plane(&self, ax: f64, ay: f64, bx: f64, by: f64) -> bool {
        (ax < self.x_min && bx < self.x_min)
            || (ax > self.x_max && bx > self.x_max)
            || (ay < self.y_min && by < self.y_min)
            || (ay > self.y_max && by > self.y_max)
    }

    /// Liang-Barsky clipping parameters for a line segment against these bounds.
    /// The returned interval lies in `[0, 1]` and describes the part inside the box.
    pub fn clip_segment_parameters(
        &self,
        ax: f64,
        ay: f64,
        bx: f64,
        by: f64,
    ) -> Option<(f64, f64)> {
        if ![ax, ay, bx, by].iter().all(|value| value.is_finite()) {
            return None;
        }
        let dx = bx - ax;
        let dy = by - ay;
        let mut enter: f64 = 0.0;
        let mut leave: f64 = 1.0;
        for (p, q) in [
            (-dx, ax - self.x_min),
            (dx, self.x_max - ax),
            (-dy, ay - self.y_min),
            (dy, self.y_max - ay),
        ] {
            if p.abs() <= f64::EPSILON {
                if q < 0.0 {
                    return None;
                }
                continue;
            }
            let ratio = q / p;
            if p < 0.0 {
                enter = enter.max(ratio);
            } else {
                leave = leave.min(ratio);
            }
            if enter > leave {
                return None;
            }
        }
        Some((enter.clamp(0.0, 1.0), leave.clamp(0.0, 1.0)))
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

    #[test]
    fn phase_space_bounds_classify_points_and_prunable_segments() {
        let bounds = PhaseSpaceBounds::try_new(-2.0, 2.0, -1.5, 1.5).unwrap();
        assert!(bounds.contains(-2.0, 1.5));
        assert!(!bounds.contains(2.1, 0.0));
        assert!(bounds.same_exterior_half_plane(3.0, 0.0, 4.0, 1.0));
        assert!(!bounds.same_exterior_half_plane(-3.0, 0.0, 3.0, 0.0));
        assert_eq!(
            bounds.clip_segment_parameters(0.0, 0.0, 4.0, 0.0),
            Some((0.0, 0.5))
        );
        assert!(bounds.clip_segment_parameters(3.0, 2.0, 4.0, 3.0).is_none());
    }
}
