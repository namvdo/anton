import { describe, expect, it } from 'vitest';
import {
  createComputeFailure,
  createComputeRequest,
  createComputeSuccess,
  parseComputeRequest,
  parseComputeResponse,
} from './computeProtocol';

describe('compute protocol', () => {
  it('round-trips a valid request and success response', () => {
    const request = createComputeRequest(1, 'computePeriodic', {
      dynamicSystem: 'custom',
      params: { a: 1.4, b: 0.3, delta: 0.15, h: 0.05, epsilon: 0.001, maxPeriod: 5 },
      viewRange: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      periodicSearchSettings: { gridSize: 10, thetaGridSize: 10, residualThreshold: 1e-10, useContinuation: false },
      customEquations: { xEq: '1 - a * x^2 + y', yEq: 'b * x' },
      customParams: [{ name: 'a', value: 1.4 }, { name: 'b', value: 0.3 }],
    });
    expect(parseComputeRequest(request)).toEqual(request);
    expect(parseComputeResponse(createComputeSuccess(request, { orbits: [] }))).toEqual({
      id: 1,
      kind: 'computePeriodic',
      ok: true,
      result: { orbits: [] },
    });
  });

  it('rejects unknown tasks and invalid payloads before posting', () => {
    expect(() => createComputeRequest(1, 'unknown', {})).toThrow('Unknown compute task');
    expect(() => createComputeRequest(1, 'computeUlam', null)).toThrow('payload must be an object');
    expect(() => createComputeRequest(0, 'computeUlam', {})).toThrow('positive safe integer');
  });

  it('requires a useful error for failed responses', () => {
    const request = createComputeRequest(2, 'computeUlam', {});
    const response = parseComputeResponse(createComputeFailure(request, new Error('invalid grid')));
    expect(response.ok ? null : response.error).toBe('invalid grid');
    expect(() => parseComputeResponse({ id: 2, kind: 'computeUlam', ok: false, error: '' }))
      .toThrow('non-empty error');
  });

  it('accepts direct and inverse geometric batch tasks', () => {
    expect(createComputeRequest(3, 'computeGeometricOffsetBatch', {
      boundary: [],
      contours: [],
    }).kind).toBe('computeGeometricOffsetBatch');
    expect(createComputeRequest(4, 'computeInverseGeometricOffsetBatch', {
      sources: [],
      params: {},
      settings: {},
    }).kind).toBe('computeInverseGeometricOffsetBatch');
  });
});
