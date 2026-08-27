import { describe, expect, it } from 'vitest';
import { randomHenonPreset, SYSTEM_CATALOG } from './systems';

describe('SYSTEM_CATALOG and presets', () => {
  it('includes Standard, Boundary-map demo, and Random presets for Henon', () => {
    const henon = SYSTEM_CATALOG.discrete.find(s => s.id === 'henon');
    expect(henon).toBeDefined();
    const presetNames = henon?.presets.map(p => p.name);
    expect(presetNames).toContain('Standard');
    expect(presetNames).toContain('Boundary-map demo');
    expect(presetNames).toContain('Random');
  });

  it('generates random Henon parameters within bounded regions a in [-1.5, 1.5], b in [-1.5, 1.5], epsilon in [0, 0.5]', () => {
    for (let i = 0; i < 100; i++) {
      const preset = randomHenonPreset();
      expect(preset.a).toBeDefined();
      expect(preset.b).toBeDefined();
      expect(preset.epsilon).toBeDefined();

      expect(preset.a).toBeGreaterThanOrEqual(-1.5);
      expect(preset.a).toBeLessThanOrEqual(1.5);

      expect(preset.b).toBeGreaterThanOrEqual(-1.5);
      expect(preset.b).toBeLessThanOrEqual(1.5);

      expect(preset.epsilon).toBeGreaterThanOrEqual(0.0);
      expect(preset.epsilon).toBeLessThanOrEqual(0.5);
    }
  });
});
