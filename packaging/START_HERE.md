# Start BIST offline

This package contains BIST, the Imperial tutorials, two reference experiments, the scientific validation report, and the Wei thesis reproduction reports and acceptance ledger from the release source.

1. Open a terminal in this directory.
2. Run `./start-bist.sh`.
3. Open the printed local address, normally `http://127.0.0.1:8000`.
4. In BIST, open **Experiment** and import `examples/experiments/henon_boundary_map.json`.
5. Press **Compute**. Imported numerical snapshots are not trusted; BIST recomputes from the validated configuration.

Python 3 is required only to serve the static application. The application itself, including the WebAssembly module and video dependency, is inside this package and does not require a network connection.

Read `docs/imperial_collaborator_package.md` for the tutorial order. The main mathematical preparation is in `docs/research/extended_henon_boundary_map.md`, and the exact reproduction status is in `docs/research/wei_thesis_reproduction.md`. Use `docs/troubleshooting.md` if the launcher or a computation fails.
