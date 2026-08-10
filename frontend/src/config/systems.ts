import packageMetadata from '../../package.json';
import type {
  BistParameters,
  CustomEquations,
  CustomParameters,
  SystemCatalog,
  SystemId,
  SystemType,
} from '../types/domain';

export const BIST_VERSION = packageMetadata.version;

export const SYSTEM_CATALOG = Object.freeze({
  discrete: Object.freeze([
    {
      id: 'henon',
      name: 'Hénon Map',
      presets: [
        { name: 'Standard', vals: { a: 1.4, b: 0.3 } },
        { name: 'Boundary-map demo', vals: { a: 0.4, b: 0.3, epsilon: 0.0625 } },
      ],
    },
    {
      id: 'duffing',
      name: 'Duffing Map',
      presets: [{ name: 'Standard', vals: { a: 2.75, b: 0.2 } }],
    },
    { id: 'custom', name: 'Custom Equations', presets: [] },
  ]),
  continuous: Object.freeze([
    {
      id: 'duffing_ode',
      name: 'Duffing Oscillator',
      presets: [{ name: 'Damped', vals: { delta: 0.15, h: 0.05, epsilon: 0.1 } }],
    },
    { id: 'custom_ode', name: 'Custom ODE', presets: [] },
  ]),
} satisfies SystemCatalog);

export const INITIAL_CUSTOM_EQUATIONS: CustomEquations = Object.freeze({
  custom: {
    xEq: '1 - a * x^2 + y',
    yEq: 'b * x',
  },
  custom_ode: {
    xEq: 'y',
    yEq: 'x - x^3 - delta * y',
  },
});

export const INITIAL_CUSTOM_PARAMS: CustomParameters = Object.freeze({
  custom: [
    { name: 'a', value: 1.4 },
    { name: 'b', value: 0.3 },
  ],
  custom_ode: [{ name: 'delta', value: 0.15 }],
});

export const INITIAL_PARAMS: BistParameters = Object.freeze({
  a: 0.4,
  b: 0.3,
  delta: 0.15,
  h: 0.05,
  epsilon: 0.1,
  startX: 0.1,
  startY: 0.1,
  maxIterations: 1000,
  maxPeriod: 5,
});

export const systemTypeFor = (systemId: SystemId): SystemType => (
  systemId === 'duffing_ode' || systemId === 'custom_ode' ? 'continuous' : 'discrete'
);

export const isCustomSystem = (systemId: SystemId): systemId is 'custom' | 'custom_ode' => (
  systemId === 'custom' || systemId === 'custom_ode'
);

export const supportsPeriodicSearch = (systemId: SystemId): boolean => (
  systemId === 'henon' || systemId === 'custom'
);
