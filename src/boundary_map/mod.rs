//! Boundary-map algorithms for bounded-noise invariant sets.
//!
//! The state is `(x, n) in R^2 x S^1`, not only the deterministic Hénon
//! position. The legacy top-level module names remain available for v0.2
//! consumers, while new development should use this domain-oriented facade.

pub mod curvature;
pub mod linearization;

pub use crate::boundary_periodic as periodic;
pub use crate::unstable_manifold as manifold;
pub mod inflation;
pub mod uncertainty_radius;
