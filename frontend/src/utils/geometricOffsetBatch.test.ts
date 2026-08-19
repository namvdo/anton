import { describe, expect, it } from 'vitest';
import {
  createGeometricOffsetContour,
  generateEvenlySpacedEpsilons,
  geometricOffsetContourColor,
  geometricOffsetContourId,
  geometricOffsetSourceContours,
  removeGeometricOffsetContour,
  replaceGeometricOffsetContours,
  selectGeometricOffsetContour,
} from './geometricOffsetBatch';
import type { GeometricOffsetState } from '../types/domain';

const stateFor = (values: number[]): GeometricOffsetState => {
  const contours = values.map(createGeometricOffsetContour);
  return {
    editorMode: 'series',
    seriesStart: values[0],
    seriesEnd: values[values.length - 1],
    seriesCount: values.length,
    individualEpsilon: 0.1,
    contours,
    selectedContourId: contours[0].id,
    preimageSourceIds: [contours[0].id],
    inverseIterations: 1,
    inverseDisplayMode: 'all',
    showInverseContours: true,
    isComputing: false,
    isComputingInverse: false,
    error: null,
    inverseError: null,
  };
};

describe('geometric offset batch state', () => {
  it('generates a stable inclusive evenly spaced series', () => {
    expect(generateEvenlySpacedEpsilons(0.02, 0.08, 4)).toEqual([0.02, 0.04, 0.06, 0.08]);
    expect(() => generateEvenlySpacedEpsilons(0.08, 0.02, 4)).toThrow(/greater/);
    expect(() => generateEvenlySpacedEpsilons(0.02, 0.08, 1)).toThrow(/between 2 and 12/);
  });

  it('preserves computed entries whose epsilon remains in a replacement series', () => {
    const initial = stateFor([0.02, 0.04]);
    initial.contours[1].result = { completed_levels: 1, levels: [] };
    const next = replaceGeometricOffsetContours(initial, [0.04, 0.06]);
    expect(next.contours[0]).toBe(initial.contours[1]);
    expect(next.contours[1].result).toBeNull();
  });

  it('makes the highlighted contour a preimage source without removing other sources', () => {
    const initial = stateFor([0.02, 0.04]);
    const secondId = geometricOffsetContourId(0.04);
    const next = selectGeometricOffsetContour(initial, secondId);
    expect(next.selectedContourId).toBe(secondId);
    expect(next.preimageSourceIds).toEqual([
      geometricOffsetContourId(0.02),
      secondId,
    ]);
  });

  it('selects a valid replacement source when the highlighted contour is removed', () => {
    const initial = stateFor([0.02, 0.04]);
    const next = removeGeometricOffsetContour(initial, geometricOffsetContourId(0.02));
    expect(next.selectedContourId).toBe(geometricOffsetContourId(0.04));
    expect(next.preimageSourceIds).toEqual([geometricOffsetContourId(0.04)]);
  });

  it('generates distinct contour colors without clamping to a fixed palette', () => {
    [1, 2, 5, 12, 32].forEach(count => {
      const colors = Array.from({ length: count }, (_, index) => (
        geometricOffsetContourColor(index)
      ));
      expect(new Set(colors).size).toBe(count);
      expect(colors.every(color => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    });
    expect(geometricOffsetContourColor(-1)).toBe(geometricOffsetContourColor(0));
  });

  it('allows an open pointwise offset to be selected as a preimage source', () => {
    const state = stateFor([0.1]);
    state.contours[0].result = {
      completed_levels: 1,
      levels: [{
        level: 1,
        target_distance: 0.1,
        boundary_components: [{
          is_closed: false,
          points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        }],
      }],
    };
    expect(geometricOffsetSourceContours(state)).toEqual([state.contours[0]]);

    state.contours[0].result.levels[0].boundary_components![0].is_closed = true;
    expect(geometricOffsetSourceContours(state)).toEqual([state.contours[0]]);
  });
});
