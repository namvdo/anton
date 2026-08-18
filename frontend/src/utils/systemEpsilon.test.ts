import { describe, expect, it } from 'vitest';
import { resolveSystemEpsilon } from './systemEpsilon';

describe('resolveSystemEpsilon', () => {
  it('preserves an explicit zero-noise value', () => {
    expect(resolveSystemEpsilon(0)).toBe(0);
  });

  it('only uses the legacy default when epsilon is absent', () => {
    expect(resolveSystemEpsilon(undefined)).toBe(0.01);
  });
});
