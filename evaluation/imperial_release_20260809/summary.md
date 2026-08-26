# Evaluation Summary (20260809_095135)

- Hardware: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/hardware.json`
- Commands run: 8
- Failed commands: 0

## Command Results

- `backend_correctness_all_tests`: PASS (29.36s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/backend_correctness_all_tests.stdout.log`
- `backend_scientific_validation`: PASS (0.57s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/backend_scientific_validation.stdout.log`
- `backend_perf_benchmarks`: PASS (14.36s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/backend_perf_benchmarks.stdout.log`
- `frontend_wasm_build`: PASS (0.84s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/frontend_wasm_build.stdout.log`
- `frontend_lint`: PASS (0.92s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/frontend_lint.stdout.log`
- `frontend_correctness_tests`: PASS (6.93s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/frontend_correctness_tests.stdout.log`
- `frontend_build`: PASS (1.54s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/frontend_build.stdout.log`
- `frontend_runtime_prep_perf`: PASS (0.28s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/imperial_release_20260809/frontend_runtime_prep_perf.stdout.log`

## Scientific Validation

- Overall result: PASS
- `henon_analytic_fixed_point`: PASS — Euclidean residual ||f(x*)-x*|| for the closed-form positive Hénon fixed point.
- `extended_boundary_map_roundtrip`: PASS — Maximum 4D error after one forward and one inverse extended Hénon boundary-map step.
- `periodic_orbit_residual`: PASS — Maximum 4D period residual across 2 reference orbit(s).
- `duffing_rk4_refinement`: PASS — Observed error-reduction ratio when the RK4 step is halved; fourth-order behavior approaches 16.
- `ulam_probability_invariants`: PASS — Maximum violation of invariant-mass normalization, row-stochasticity, and non-negativity.

## Backend Performance Cases

- `periodic_typical_henon` (typical): 2032.17 ms
- `periodic_interesting_bifurcation_pre` (interesting): 2988.94 ms
- `periodic_interesting_bifurcation_post` (interesting): 2953.84 ms
- `periodic_stress_dense_search` (stress): 5740.14 ms
- `manifold_typical_henon` (typical): 2.50 ms
- `manifold_interesting_near_bifurcation` (interesting): 1.22 ms
- `manifold_stress_large_budget` (stress): 2.95 ms
- `ulam_typical_grid48` (typical): 24.61 ms
- `ulam_interesting_grid64` (interesting): 94.82 ms
- `ulam_stress_grid80` (stress): 231.14 ms
- `continuous_rk4_typical` (typical): 1.05 ms
- `continuous_rk4_stress` (stress): 4.11 ms

## Frontend Runtime-Prep Cases

- `payload_clone_typical` (typical): avg 0.92 ms
- `payload_clone_stress` (stress): avg 15.09 ms
- `manifold_geometry_typical` (typical): avg 2.73 ms
- `manifold_geometry_stress` (stress): avg 9.88 ms
- `ulam_overlay_typical` (typical): avg 0.32 ms
- `ulam_overlay_stress` (stress): avg 0.46 ms
