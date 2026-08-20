import { describe, expect, it } from 'vitest';
import {
  colormapCssGradient,
  rgbToHex,
  sampleColormap,
  sampleTracerColor,
} from './colormaps';

describe('colormaps', () => {
  it('samples valid RGB float values in [0, 1] across all colormaps', () => {
    const maps = ['magma', 'viridis', 'plasma', 'rdbu', 'rainbow', 'turbo'] as const;
    maps.forEach(name => {
      [0, 0.25, 0.5, 0.75, 1.0].forEach(t => {
        const [r, g, b] = sampleColormap(name, t);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
      });
    });
  });

  it('samples tracer colors smoothly along point indices', () => {
    const first = sampleTracerColor(0, 10, 'rainbow');
    const middle = sampleTracerColor(5, 10, 'rainbow');
    const last = sampleTracerColor(9, 10, 'rainbow');
    expect(first).toBeDefined();
    expect(middle).toBeDefined();
    expect(last).toBeDefined();
    expect(first).not.toEqual(middle);
  });

  it('clamps out of bounds parameters gracefully', () => {
    const atZero = sampleColormap('magma', 0);
    const belowZero = sampleColormap('magma', -10);
    expect(belowZero).toEqual(atZero);

    const atOne = sampleColormap('magma', 1);
    const aboveOne = sampleColormap('magma', 99);
    expect(aboveOne).toEqual(atOne);
  });

  it('generates valid CSS hex codes and gradient strings', () => {
    const hex = rgbToHex([1, 0, 0]);
    expect(hex).toBe('#ff0000');

    const gradient = colormapCssGradient('magma');
    expect(gradient).toContain('linear-gradient(to right');
    expect(gradient).toContain('#');
  });

  it('defaults to magma for unknown colormap names', () => {
    const fallback = sampleColormap('non_existent', 0.5);
    const magmaSample = sampleColormap('magma', 0.5);
    expect(fallback).toEqual(magmaSample);
  });
});
