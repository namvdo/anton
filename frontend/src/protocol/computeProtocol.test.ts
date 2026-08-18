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
    const request = createComputeRequest(1, 'computePeriodic', { params: {} });
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
