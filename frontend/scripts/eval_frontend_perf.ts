import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

interface Measurement {
  case_id: string;
  category: string;
  scenario: string;
  runs: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  params: Record<string, number>;
  outputs: Record<string, number>;
}

interface BenchmarkOrbit {
  period: number;
  stability: string;
  points: number[][];
}

function parseOutArg(): string | null {
  const idx = process.argv.indexOf('--out');
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function measure(
  label: string,
  scenario: string,
  runs: number,
  fn: (iteration: number) => Record<string, number>,
  params: Record<string, number> = {},
): Measurement {
  const timings: number[] = [];
  let extra: Record<string, number> = {};
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    extra = fn(i) || extra;
    const t1 = performance.now();
    timings.push(t1 - t0);
  }

  const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
  const minMs = Math.min(...timings);
  const maxMs = Math.max(...timings);

  return {
    case_id: label,
    category: 'frontend_runtime_prep',
    scenario,
    runs,
    avg_ms: Number(avgMs.toFixed(4)),
    min_ms: Number(minMs.toFixed(4)),
    max_ms: Number(maxMs.toFixed(4)),
    params,
    outputs: extra
  };
}

function createOrbitPayload(orbits: number, pointsPerOrbit: number, seed = 42): {
  kind: string;
  periodicOrbits: BenchmarkOrbit[];
} {
  const rnd = lcg(seed);
  const payload = {
    kind: 'computeManifoldsResult',
    periodicOrbits: [] as BenchmarkOrbit[]
  };

  for (let i = 0; i < orbits; i += 1) {
    const points = [];
    for (let j = 0; j < pointsPerOrbit; j += 1) {
      points.push([rnd() * 4 - 2, rnd() * 3 - 1.5]);
    }
    payload.periodicOrbits.push({
      period: (i % 7) + 1,
      stability: i % 3 === 0 ? 'stable' : (i % 3 === 1 ? 'unstable' : 'saddle'),
      points
    });
  }
  return payload;
}

function manifoldGeometryCase(
  branches: number,
  pointsPerBranch: number,
  seed = 7,
): Record<string, number> {
  const rnd = lcg(seed);
  const geometries = [];
  let totalPoints = 0;

  for (let i = 0; i < branches; i += 1) {
    const points = [];
    let x = rnd() * 0.5 - 0.25;
    let y = rnd() * 0.5 - 0.25;
    for (let j = 0; j < pointsPerBranch; j += 1) {
      x += (rnd() - 0.5) * 0.01;
      y += (rnd() - 0.5) * 0.01;
      points.push(new THREE.Vector3(x, y, 0.0));
    }
    totalPoints += points.length;
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    geometries.push(geom);
  }

  for (const geom of geometries) {
    geom.dispose();
  }

  return { total_points: totalPoints, branches };
}

function ulamOverlayCase(subdivisions: number, seed = 99): Record<string, number> {
  const rnd = lcg(seed);
  const n = subdivisions * subdivisions;
  const measure = new Float32Array(n);
  let maxVal = 0.0;

  for (let i = 0; i < n; i += 1) {
    const value = rnd() ** 3;
    measure[i] = value;
    if (value > maxVal) maxVal = value;
  }

  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const normalized = maxVal > 0 ? measure[i] / maxVal : 0;
    colors[i * 3] = normalized;
    colors[i * 3 + 1] = Math.sqrt(normalized);
    colors[i * 3 + 2] = 1 - normalized;
  }

  return { grid_boxes: n };
}

async function main(): Promise<void> {
  const outPath = parseOutArg();
  const records: Measurement[] = [];

  records.push(
    measure(
      'payload_clone_typical',
      'typical',
      12,
      () => {
        const payload = createOrbitPayload(40, 80);
        const cloned = structuredClone(payload);
        return { orbits: cloned.periodicOrbits.length, points_per_orbit: 80 };
      },
      { orbits: 40, points_per_orbit: 80 }
    )
  );

  records.push(
    measure(
      'payload_clone_stress',
      'stress',
      8,
      () => {
        const payload = createOrbitPayload(250, 240);
        const cloned = structuredClone(payload);
        return { orbits: cloned.periodicOrbits.length, points_per_orbit: 240 };
      },
      { orbits: 250, points_per_orbit: 240 }
    )
  );

  records.push(
    measure(
      'manifold_geometry_typical',
      'typical',
      10,
      () => manifoldGeometryCase(12, 2000),
      { branches: 12, points_per_branch: 2000 }
    )
  );

  records.push(
    measure(
      'manifold_geometry_stress',
      'stress',
      6,
      () => manifoldGeometryCase(40, 5000),
      { branches: 40, points_per_branch: 5000 }
    )
  );

  records.push(
    measure(
      'ulam_overlay_typical',
      'typical',
      10,
      () => ulamOverlayCase(64),
      { subdivisions: 64, boxes: 64 * 64 }
    )
  );

  records.push(
    measure(
      'ulam_overlay_stress',
      'stress',
      6,
      () => ulamOverlayCase(128),
      { subdivisions: 128, boxes: 128 * 128 }
    )
  );

  const payload = {
    generated_at_unix: Math.floor(Date.now() / 1000),
    records
  };

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote frontend performance results to ${outPath}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
