const GOLDEN_ANGLE_DEGREES = 137.50776405003785;
const LIGHTNESS_CYCLE = Object.freeze([0.64, 0.72, 0.57, 0.67]);

const normalizeCategoryIndex = (index: number): number => {
  const numericIndex = Number(index);
  return Number.isFinite(numericIndex) && numericIndex >= 0
    ? Math.trunc(numericIndex)
    : 0;
};

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSector = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSector % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSector < 1) [red, green] = [chroma, secondary];
  else if (hueSector < 2) [red, green] = [secondary, chroma];
  else if (hueSector < 3) [green, blue] = [chroma, secondary];
  else if (hueSector < 4) [green, blue] = [secondary, chroma];
  else if (hueSector < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  const lightnessOffset = lightness - chroma / 2;
  const channelHex = (channel: number) => Math.round((channel + lightnessOffset) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
};

/**
 * Generates a stable categorical color without imposing a palette-size limit.
 * Golden-angle hue spacing keeps neighboring indices visually separated, while
 * the lightness cycle helps when a large batch contains nearby hues.
 */
export const categoricalCurveColor = (index: number): string => {
  const categoryIndex = normalizeCategoryIndex(index);
  const hue = (205 + categoryIndex * GOLDEN_ANGLE_DEGREES) % 360;
  const lightness = LIGHTNESS_CYCLE[categoryIndex % LIGHTNESS_CYCLE.length];
  return hslToHex(hue, 0.82, lightness);
};
