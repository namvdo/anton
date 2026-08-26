# Evaluation Summary (20260421_173139)

- Hardware: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/hardware.json`
- Commands run: 5
- Failed commands: 0

## Command Results

- `backend_correctness_all_tests`: PASS (46.05s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/backend_correctness_all_tests.stdout.log`
- `backend_perf_benchmarks`: PASS (21.34s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/backend_perf_benchmarks.stdout.log`
- `frontend_correctness_tests`: PASS (3.71s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/frontend_correctness_tests.stdout.log`
- `frontend_build`: PASS (1.69s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/frontend_build.stdout.log`
- `frontend_runtime_prep_perf`: PASS (0.33s) | log: `/Users/namdo/Desktop/research/dynamical_systems/set-valued-viz/evaluation/results_20260421_173139/frontend_runtime_prep_perf.stdout.log`

## Backend Performance Cases

- `periodic_typical_henon` (typical): 1650.63 ms
- `periodic_interesting_bifurcation_pre` (interesting): 2574.79 ms
- `periodic_interesting_bifurcation_post` (interesting): 2592.32 ms
- `periodic_stress_dense_search` (stress): 4891.03 ms
- `manifold_typical_henon` (typical): 3.10 ms
- `manifold_interesting_near_bifurcation` (interesting): 1.48 ms
- `manifold_stress_large_budget` (stress): 3.07 ms
- `ulam_typical_grid48` (typical): 31.68 ms
- `ulam_interesting_grid64` (interesting): 119.71 ms
- `ulam_stress_grid80` (stress): 296.58 ms
- `continuous_rk4_typical` (typical): 1.62 ms
- `continuous_rk4_stress` (stress): 6.44 ms

## Frontend Runtime-Prep Cases

- `payload_clone_typical` (typical): avg 1.11 ms
- `payload_clone_stress` (stress): avg 18.14 ms
- `manifold_geometry_typical` (typical): avg 2.93 ms
- `manifold_geometry_stress` (stress): avg 11.77 ms
- `ulam_overlay_typical` (typical): avg 0.29 ms
- `ulam_overlay_stress` (stress): avg 0.57 ms
