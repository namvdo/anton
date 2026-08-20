/**
 * Standard scientific colormaps (Magma, Viridis, Plasma, and Diverging RdBu).
 * Pre-computed control knots and fast linear interpolation lookup for [0, 1] normalized values.
 */

export type RGB = [number, number, number];

// 9-point control knots for Magma (Matplotlib / Perceptually Uniform)
const MAGMA_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.001462, 0.000466, 0.013866] },
  { t: 0.125, rgb: [0.101344, 0.052601, 0.252062] },
  { t: 0.25, rgb: [0.255953, 0.061036, 0.428755] },
  { t: 0.375, rgb: [0.428073, 0.108991, 0.485122] },
  { t: 0.5, rgb: [0.609565, 0.178873, 0.449774] },
  { t: 0.625, rgb: [0.785078, 0.270921, 0.354148] },
  { t: 0.75, rgb: [0.923485, 0.414389, 0.228965] },
  { t: 0.875, rgb: [0.985959, 0.640103, 0.245051] },
  { t: 1.0, rgb: [0.987053, 0.991438, 0.749504] },
]);

// 9-point control knots for Viridis
const VIRIDIS_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.267004, 0.004874, 0.329415] },
  { t: 0.125, rgb: [0.282623, 0.140926, 0.457517] },
  { t: 0.25, rgb: [0.253935, 0.265254, 0.529983] },
  { t: 0.375, rgb: [0.199430, 0.387601, 0.554664] },
  { t: 0.5, rgb: [0.134692, 0.511776, 0.548772] },
  { t: 0.625, rgb: [0.124868, 0.635832, 0.486259] },
  { t: 0.75, rgb: [0.288921, 0.758394, 0.364426] },
  { t: 0.875, rgb: [0.578304, 0.828452, 0.207869] },
  { t: 1.0, rgb: [0.993248, 0.906157, 0.143936] },
]);

// 9-point control knots for Plasma
const PLASMA_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.050383, 0.029803, 0.527975] },
  { t: 0.125, rgb: [0.254627, 0.013882, 0.615419] },
  { t: 0.25, rgb: [0.417642, 0.000564, 0.658390] },
  { t: 0.375, rgb: [0.562738, 0.051545, 0.641509] },
  { t: 0.5, rgb: [0.692840, 0.165141, 0.564528] },
  { t: 0.625, rgb: [0.804586, 0.289869, 0.446867] },
  { t: 0.75, rgb: [0.897430, 0.435772, 0.308253] },
  { t: 0.875, rgb: [0.963499, 0.612543, 0.146747] },
  { t: 1.0, rgb: [0.940015, 0.975158, 0.131326] },
]);

// Diverging RdBu knots (Cool Blue -> White/Neutral -> Warm Red)
const RDBU_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.0196, 0.1882, 0.3804] },   // Deep Blue (contraction < 1)
  { t: 0.15, rgb: [0.1294, 0.4000, 0.6745] },
  { t: 0.3, rgb: [0.4039, 0.6627, 0.8118] },
  { t: 0.42, rgb: [0.7412, 0.8431, 0.9059] },
  { t: 0.5, rgb: [0.9686, 0.9686, 0.9686] },   // Neutral White / Light Gray (ratio = 1)
  { t: 0.58, rgb: [0.9922, 0.8000, 0.7098] },
  { t: 0.7, rgb: [0.9569, 0.5333, 0.4039] },
  { t: 0.85, rgb: [0.8431, 0.1882, 0.1529] },
  { t: 1.0, rgb: [0.4039, 0.0000, 0.0510] },   // Deep Red (expansion > 1)
]);

const interpolateKnots = (
  knots: ReadonlyArray<{ t: number; rgb: RGB }>,
  tNorm: number,
): RGB => {
  const t = Math.max(0, Math.min(1, Number.isFinite(tNorm) ? tNorm : 0));
  if (t <= knots[0].t) return knots[0].rgb;
  if (t >= knots[knots.length - 1].t) return knots[knots.length - 1].rgb;

  for (let i = 0; i < knots.length - 1; i += 1) {
    const k0 = knots[i];
    const k1 = knots[i + 1];
    if (t >= k0.t && t <= k1.t) {
      const frac = (t - k0.t) / (k1.t - k0.t);
      return [
        k0.rgb[0] + frac * (k1.rgb[0] - k0.rgb[0]),
        k0.rgb[1] + frac * (k1.rgb[1] - k0.rgb[1]),
        k0.rgb[2] + frac * (k1.rgb[2] - k0.rgb[2]),
      ];
    }
  }
  return knots[knots.length - 1].rgb;
};

/** Precomputes a 256-entry RGB lookup table for O(1) sampling */
const buildColormapLut = (
  knots: ReadonlyArray<{ t: number; rgb: RGB }>,
): Float32Array => {
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    const [r, g, b] = interpolateKnots(knots, t);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
};

// 7-point cyclic Rainbow knots (Red -> Orange -> Yellow -> Green -> Cyan -> Violet -> Red)
const RAINBOW_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.95, 0.20, 0.20] },
  { t: 0.17, rgb: [0.95, 0.58, 0.15] },
  { t: 0.33, rgb: [0.92, 0.88, 0.15] },
  { t: 0.50, rgb: [0.20, 0.85, 0.35] },
  { t: 0.67, rgb: [0.15, 0.70, 0.95] },
  { t: 0.83, rgb: [0.55, 0.30, 0.95] },
  { t: 1.0, rgb: [0.95, 0.20, 0.20] },
]);

// 9-point Turbo colormap knots
const TURBO_KNOTS: ReadonlyArray<{ t: number; rgb: RGB }> = Object.freeze([
  { t: 0.0, rgb: [0.18995, 0.07176, 0.23217] },
  { t: 0.125, rgb: [0.25055, 0.34448, 0.81745] },
  { t: 0.25, rgb: [0.15284, 0.62777, 0.97341] },
  { t: 0.375, rgb: [0.13401, 0.81977, 0.74971] },
  { t: 0.5, rgb: [0.42858, 0.92211, 0.36442] },
  { t: 0.625, rgb: [0.77884, 0.88048, 0.14728] },
  { t: 0.75, rgb: [0.97858, 0.67494, 0.13658] },
  { t: 0.875, rgb: [0.97534, 0.36987, 0.13619] },
  { t: 1.0, rgb: [0.57830, 0.04144, 0.00392] },
]);

// 8 distinct high-contrast palette colors for uniform segmented point bands
export const SEGMENTED_PALETTE: ReadonlyArray<RGB> = Object.freeze([
  [0.90, 0.10, 0.29], // Bright Red
  [0.96, 0.51, 0.19], // Orange
  [1.00, 0.88, 0.10], // Yellow
  [0.24, 0.71, 0.29], // Green
  [0.26, 0.83, 0.96], // Cyan
  [0.26, 0.39, 0.85], // Royal Blue
  [0.57, 0.12, 0.71], // Purple
  [0.94, 0.20, 0.90], // Magenta
]);

export const COLORMAP_LUTS = Object.freeze({
  magma: buildColormapLut(MAGMA_KNOTS),
  viridis: buildColormapLut(VIRIDIS_KNOTS),
  plasma: buildColormapLut(PLASMA_KNOTS),
  rdbu: buildColormapLut(RDBU_KNOTS),
  rainbow: buildColormapLut(RAINBOW_KNOTS),
  turbo: buildColormapLut(TURBO_KNOTS),
});

export type ColormapKey = keyof typeof COLORMAP_LUTS;

/** Samples colormap at parameter t in [0, 1] returning [r, g, b] in [0, 1] */
export const sampleColormap = (name: ColormapKey | string, t: number): RGB => {
  const lut = COLORMAP_LUTS[name as ColormapKey] || COLORMAP_LUTS.magma;
  const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const index = Math.min(255, Math.floor(clampedT * 255));
  return [
    lut[index * 3],
    lut[index * 3 + 1],
    lut[index * 3 + 2],
  ];
};

/** Converts RGB float [0, 1] to CSS hex string "#rrggbb" */
export const rgbToHex = ([r, g, b]: RGB): string => {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255)))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/** Returns an RGB color for point index i out of totalCount points using the selected colormap */
export const sampleTracerColor = (
  index: number,
  totalCount: number,
  colormap = 'rainbow',
): RGB => {
  if (totalCount <= 1) return sampleColormap(colormap, 0.5);
  const t = Math.max(0, Math.min(1, index / (totalCount - 1)));
  return sampleColormap(colormap, t);
};

/** Returns a CSS linear-gradient string for a colormap */
export const colormapCssGradient = (name: ColormapKey | string): string => {
  const steps = [0, 0.25, 0.5, 0.75, 1.0];
  const colorStops = steps.map(t => `${rgbToHex(sampleColormap(name, t))} ${Math.round(t * 100)}%`);
  return `linear-gradient(to right, ${colorStops.join(', ')})`;
};
