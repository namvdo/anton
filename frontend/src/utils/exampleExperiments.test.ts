import { describe, expect, it } from 'vitest';
import duffingExperiment from '../../../examples/experiments/duffing_continuous.json';
import henonExperiment from '../../../examples/experiments/henon_boundary_map.json';
import { parseExperimentBundle } from './experimentBundle';

describe('committed example experiments', () => {
  it.each([
    ['Hénon boundary map', henonExperiment, 'henon'],
    ['continuous Duffing', duffingExperiment, 'duffing_ode'],
  ])('keeps the %s configuration compatible with the current schema', (_name, fixture, systemId) => {
    const parsed = parseExperimentBundle(JSON.stringify(fixture));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.configuration.system.id).toBe(systemId);
    expect(parsed.results.periodic.orbits).toEqual([]);
  });
});
