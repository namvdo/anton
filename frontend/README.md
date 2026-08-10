# BIST frontend

The supported browser application is React 19 with strict TypeScript, Vite, Three.js, a dedicated compute worker, and the Rust-generated WebAssembly package. Authored runtime code, workers, build scripts, and tests use `.ts` or `.tsx`; `pkg/bist.js` is generated WebAssembly glue and is not maintained by hand.

Install the locked dependencies and regenerate the Rust bindings before starting the application:

```bash
npm ci
npm run build:wasm
npm run dev
```

Use `npm run typecheck` for the strict compiler check, `npm run lint` for TypeScript and React rules, `npm test` for the unit and component suite, and `npm run build` for the checked production bundle. `npm run verify` runs the frontend checks together. The repository-level `../scripts/verify.sh` also runs Rust, scientific, WebAssembly, and dependency checks.

Shared scientific and UI contracts live in `src/types/domain.ts`. Worker messages must pass through `src/protocol/computeProtocol.ts` and `src/services/ComputeWorkerClient.ts`. System metadata and numerical constants live in `src/config/`; components should consume those definitions instead of creating local copies.
