# Changelog

All notable BIST changes are recorded here. The project uses semantic versioning for collaborator-facing releases.

## [Unreleased]

### Added

- Experiment bundle schema version 2 with a formal JSON Schema, complete applied solver settings, grouped results, residual diagnostics, clean/dirty source state, and explicit version-1 migration.
- Periodic-orbit closure, unit-normal, and reduced multiplier-relation diagnostics in the boundary-map WebAssembly result.
- State-dependent uncertainty radius fields over the unit normal bundle: an `UncertaintyRadiusField2D` trait pairing `epsilon(y)` with `grad epsilon(y)` in a single sample, constant and sinusoidal implementations, and a contractivity certificate with fail-fast validation.

### Fixed

- Allow a system noise radius of `epsilon = 0` across the interface, parameter sweeps, discrete maps, manifold routines, and Ulam computations so the position dynamics reduce to the deterministic system.

## [0.2.0] — 2026-08-09

### Added

- Repeatable Rust, WebAssembly, frontend, CI, evaluation, and release workflows.
- Typed phase-space and periodic-search configuration with fail-fast validation.
- Validated compute-worker protocol, request client, and React hook.
- Versioned experiment JSON export/import with provenance and recomputation.
- Scientific validation runner covering analytic, inverse-map, periodic, integration, and probability invariants.
- Reduced three-dimensional boundary-map monodromy, multiplier-identity validation, and curvature/wedge diagnostics.
- Explicit Euclidean and (L^\infty) bounded-noise geometry, support-seeded absorption probabilities, and topology mask diagnostics.
- Wei thesis reproduction command, exact checkpoint ledger, and master-thesis method crosswalk.
- Long-term `boundary_map`, `set_oriented`, and `scientific` source folders with v0.2 compatibility exports.
- Imperial collaborator tutorials, demonstration script, rehearsal guide, troubleshooting, and offline package.

### Changed

- Renamed packages from the original Hénon-specific name to BIST.
- Centralized system catalogs, presets, defaults, and capability checks.
- Bundled the video muxer locally and changed video encoding to a module worker.
- Removed silent placeholder behavior for unsupported periodic searches.
- Corrected ambiguous Ulam left/right eigenvector semantics and removed the uniform absorption seed.
- Cleaned Rust and frontend lints and removed unused dependencies and generated files.

### Known limitations

- Periodic searches use finite seed grids and do not prove completeness.
- Geometric offset preimages are not yet validated as basin boundaries.
- The periodic and manifold implementations are in their long-term domain folders but still need incremental internal extraction.
- High-period normal-bundle and topological-bifurcation targets require expensive manifold/MIS refinement and are not release-green CI claims.
- `mp4-muxer` is locked for this release but deprecated upstream.

## [0.1.0] — 2026-04-24

- Initial research application and technical report release.
