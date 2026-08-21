use crate::boundary_map::linearization::{
    eigenvalue_magnitudes as reduced_eigenvalue_magnitudes, multiplier_relation_residual,
    reduce_periodic_monodromy,
};
use crate::dynamical_systems::{
    DynamicalSystem, ExtendedState, HenonSystem, UserDefinedDynamicalSystem,
};
use crate::parameters::parameter_set_from_js;
use crate::range::{clamp_pair, PhaseSpaceBounds, RANGE_LIMIT};
use core::f64;
use nalgebra::{Matrix4, Vector2};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use web_sys::console;

mod henon;
mod search;
mod sweep;
mod types;

pub use henon::*;
pub use search::{
    find_all_boundary_periodic_orbits_generic,
    find_all_boundary_periodic_orbits_generic_with_threshold,
};
pub use sweep::*;
pub use types::*;

use henon::periodic_orbit_js;
use search::{
    boundary_map_generic, compose_boundary_map_n_times_generic,
    find_boundary_periodic_point_davidchack_lai_generic, try_add_orbit_generic,
};

#[cfg(test)]
use search::{boundary_map_jacobian_generic, verify_minimal_period_generic};

#[cfg(test)]
mod tests;
