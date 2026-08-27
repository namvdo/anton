import { describe, expect, it } from 'vitest';
import type { InverseOffsetResult } from '../types/domain';
import {
  compactInverseOffsetResult,
  inverseResultPointBudget,
  MAX_INVERSE_RESULT_POINTS,
} from './inverseOffsetTransport';

describe('inverse offset worker transport', () => {
  it('shares the global structured-clone budget across batch sources', () => {
    expect(inverseResultPointBudget(1)).toBe(MAX_INVERSE_RESULT_POINTS);
    expect(inverseResultPointBudget(4)).toBe(MAX_INVERSE_RESULT_POINTS / 4);
    expect(inverseResultPointBudget(0)).toBe(MAX_INVERSE_RESULT_POINTS);
  });

  it('bounds a 100-step result while retaining every step and aligned diagnostics', () => {
    const result: InverseOffsetResult = {
      curves: Array.from({ length: 100 }, (_, inverse_iteration) => ({
        inverse_iteration: inverse_iteration + 1,
        is_closed: false,
        output_point_count: 100,
        points: Array.from({ length: 100 }, (_, index) => ({
          x: inverse_iteration,
          y: index,
          nx: 1,
          ny: 0,
        })),
        local_spacings: Array.from({ length: 100 }, (_, index) => index),
        step_ratios: Array.from({ length: 100 }, (_, index) => index + 1),
        densities: Array.from({ length: 100 }, (_, index) => index + 2),
      })),
    };

    compactInverseOffsetResult(result, 1_000);

    expect(result.curves).toHaveLength(100);
    expect(result.retained_output_points).toBe(1_000);
    expect(result.curves.every(curve => curve.points?.length === 10)).toBe(true);
    expect(result.curves.every(curve => curve.display_decimated)).toBe(true);
    expect(result.curves.every(curve => (
      curve.points?.length === curve.local_spacings?.length
      && curve.points?.length === curve.step_ratios?.length
      && curve.points?.length === curve.densities?.length
    ))).toBe(true);
    expect(result.curves[0].points?.[0].y).toBe(0);
    expect(result.curves[0].points?.at(-1)?.y).toBe(99);
  });
});
