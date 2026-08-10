// WebAssembly constructors and numerical kernels intentionally expose flat
// positional arguments at the JavaScript ABI. Internal orchestration uses
// typed configuration objects on the frontend.
#![allow(clippy::too_many_arguments)]

// Compatibility exports retain the v0.2 public API while implementation files
// live in domain folders. New code should prefer the paths documented in the
// public facades below.
pub mod boundary_map;
#[path = "boundary_map/periodic/mod.rs"]
pub mod boundary_periodic;
pub use boundary_periodic::*;

#[path = "boundary_map/manifold/mod.rs"]
pub mod unstable_manifold;
pub use unstable_manifold::*;

pub mod set_oriented;
#[path = "set_oriented/ulam/mod.rs"]
pub mod ulam;
pub use ulam::*;

mod video_recorder;
pub use video_recorder::*;

mod duffing;
pub use duffing::*;

mod duffing_manifold;
pub use duffing_manifold::*;

pub mod duffing_periodic;

mod hausdorff;
pub use hausdorff::*;

mod parameters;
pub mod range;
mod user_defined;

mod dynamical_systems;
pub use dynamical_systems::*;

mod henon_extended_map;

mod continuous_ds;
pub use continuous_ds::*;

mod geometric_offsets;
pub use geometric_offsets::*;

pub mod scientific;
#[path = "scientific/validation.rs"]
pub mod validation;
