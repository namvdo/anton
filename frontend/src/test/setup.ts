import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const noop = () => {};
const canvasContext = {
  arc: noop,
  beginPath: noop,
  clearRect: noop,
  fill: noop,
  fillRect: noop,
  fillText: noop,
  lineTo: noop,
  moveTo: noop,
  restore: noop,
  rotate: noop,
  save: noop,
  setLineDash: noop,
  stroke: noop,
  translate: noop,
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => canvasContext,
});

afterEach(() => {
  cleanup();
});
