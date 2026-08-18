import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controlsBarMock = vi.fn();

vi.mock('../sidebar/SystemPicker', () => ({ SystemPicker: () => <div data-testid="system-picker" /> }));
vi.mock('../sidebar/EquationDisplay', () => ({ EquationDisplay: () => <div data-testid="equation-display" /> }));
vi.mock('../sidebar/ParametersPanel', () => ({ ParametersPanel: () => <div data-testid="parameters-panel" /> }));
vi.mock('../sidebar/ManifoldsPanel', () => ({ ManifoldsPanel: () => <div data-testid="manifolds-panel" /> }));
vi.mock('../sidebar/GeometricOffsetsPanel', () => ({ GeometricOffsetsPanel: () => <div data-testid="geometric-offsets-panel" /> }));
vi.mock('../sidebar/VisualizationPanel', () => ({ VisualizationPanel: () => <div data-testid="visualization-panel" /> }));
vi.mock('../sidebar/StartingPoint', () => ({ StartingPoint: () => <div data-testid="starting-point" /> }));
vi.mock('../sidebar/PeriodicOrbitsPanel', () => ({ PeriodicOrbitsPanel: () => <div data-testid="periodic-orbits" /> }));
vi.mock('../sidebar/PeriodicSearchPanel', () => ({ PeriodicSearchPanel: () => <div data-testid="periodic-search-panel" /> }));
vi.mock('../sidebar/UlamPanel', () => ({ UlamPanel: () => <div data-testid="ulam-panel" /> }));
vi.mock('../sidebar/AnimationPanel', () => ({ AnimationPanel: () => <div data-testid="animation-panel" /> }));
vi.mock('../sidebar/ParameterSweepPanel', () => ({ ParameterSweepPanel: () => <div data-testid="sweep-panel" /> }));
vi.mock('./InfoStrip', () => ({ InfoStrip: () => <div data-testid="info-strip" /> }));
vi.mock('./ControlsBar', () => ({
  ControlsBar: (props: Record<string, unknown>) => {
    controlsBarMock(props);
    return <div data-testid="controls-bar" />;
  }
}));

import { Sidebar } from './Sidebar';

const baseProps = {
  type: 'continuous',
  setType: vi.fn(),
  dynamicSystem: 'duffing_ode',
  setDynamicSystem: vi.fn(),
  SYSTEMS: { continuous: [], discrete: [] },
  exportExperiment: vi.fn(),
  importExperiment: vi.fn(),
  experimentStatus: null,
  customEquations: {
    custom: { xEq: '1 - a * x^2 + y', yEq: 'b * x' },
    custom_ode: { xEq: 'y', yEq: 'x - x^3 - delta * y' },
  },
  setCustomEquations: vi.fn(),
  equationError: null,
  params: {
    a: 0.4,
    b: 0.3,
    delta: 0.15,
    h: 0.05,
    epsilon: 0.1,
    startX: 0.1,
    startY: 0.1,
    maxIterations: 1000,
    maxPeriod: 5,
  },
  setParams: vi.fn(),
  applyPreset: vi.fn(),
  customParams: [],
  setCustomParams: vi.fn(),
  paramErrors: [],
  hasPendingInputChanges: false,
  applyInputsAndRecompute: vi.fn(),
  appliedParams: {
    a: 0.4,
    b: 0.3,
    delta: 0.15,
    h: 0.05,
    epsilon: 0.1,
    startX: 0.1,
    startY: 0.1,
    maxIterations: 1000,
    maxPeriod: 5,
  },
  viewRange: { xMin: -2, xMax: 2, yMin: -1.5, yMax: 1.5 },
  setViewRange: vi.fn(),
  rangeLimit: 10,
  resetViewRange: vi.fn(),
  manifoldState: {
    manifolds: [],
    rawManifolds: [],
    stableManifolds: [],
    fixedPoints: [],
    intersections: [],
    isComputing: false,
    isReady: false,
    sourcePeriodicRevision: 0,
    showOrbits: true,
    showUnstableManifold: false,
    showDeterministicImageBoundary: false,
    showNoiseBalls: false,
    showBoundarySamplePoints: false,
    maximumManifoldPointSpacing: 0.005,
    showStableManifold: false,
    intersectionThreshold: 0.02,
    currentPoint: { x: 0.1, y: 0.1, nx: 1, ny: 0 },
    trajectoryPoints: [],
    iteration: 0,
    isRunning: false,
    hasStarted: false,
    showTrail: true,
    startPoint: { x: 0.1, y: 0.1, nx: 1, ny: 0 },
  },
  setManifoldState: vi.fn(),
  hasClosedMisBoundary: false,
  boundaryLayerError: null,
  boundarySampling: { unstable: null, deterministic: null },
  geometricOffsetState: {
    editorMode: 'series',
    seriesStart: 0.025,
    seriesEnd: 0.125,
    seriesCount: 5,
    individualEpsilon: 0.0625,
    contours: [{
      id: 'epsilon-0p062500000000',
      epsilon: 0.0625,
      visible: true,
      result: null,
      inverseResult: null,
      error: null,
      inverseError: null,
    }],
    selectedContourId: 'epsilon-0p062500000000',
    preimageSourceIds: ['epsilon-0p062500000000'],
    inverseIterations: 3,
    inverseDisplayMode: 'all',
    showInverseContours: true,
    isComputing: false,
    isComputingInverse: false,
    error: null,
    inverseError: null,
  },
  setGeometricOffsetState: vi.fn(),
  canComputeGeometricOffsets: false,
  computeGeometricOffsets: vi.fn(),
  canComputeInverseGeometricOffsets: false,
  computeInverseGeometricOffsets: vi.fn(),
  fitInverseGeometricOffsets: vi.fn(),
  ORBIT_COLORS: { manifold: '#e67e22', stableManifold: '#3498db' },
  filters: {
    period1: true,
    period2: true,
    period3: true,
    period4: true,
    period5: true,
    period6plus: false,
  },
  setFilters: vi.fn(),
  periodicState: {
    orbits: [],
    isReady: false,
    showOrbits: false,
    computeMethod: null,
    resultRevision: 0,
    renderedRevision: 0,
    renderedPointCount: 0,
  },
  periodicSearchSettings: {
    gridSize: 10,
    thetaGridSize: 10,
    residualThreshold: 1e-10,
    useContinuation: true,
  },
  appliedPeriodicSearchSettings: {
    gridSize: 10,
    thetaGridSize: 10,
    residualThreshold: 1e-10,
    useContinuation: false,
  },
  updatePeriodicSearchSettings: vi.fn(),
  runPeriodicGridSearch: vi.fn(),
  updateStartPoint: vi.fn(),
  animationState: {
    isAnimating: false,
    isPreparing: false,
    parameter: 'a',
    rangeValue: 0.1,
    direction: 1,
    steps: 10,
    currentStep: 0,
    baseValue: null,
    targetValue: null,
    awaitingResult: false,
    expectedPeriodicRevision: null,
  },
  setAnimationState: vi.fn(),
  recordingState: {
    isRecording: false,
    isEncoding: false,
    frameCount: 0,
    recordingEnabled: false,
    encodingProgress: 0,
    error: null,
  },
  startAnimation: vi.fn(),
  stopAnimation: vi.fn(),
  toggleRecording: vi.fn(),
  ulamState: {
    gridBoxes: [],
    invariantMeasure: null,
    leftEigenvector: null,
    transitions: null,
    selectedBoxIndex: null,
    currentBoxIndex: -1,
    isComputing: false,
    subdivisions: 32,
    pointsPerBox: 64,
    epsilon: 0.05,
    showUlamOverlay: false,
    showTransitions: true,
    showCurrentBox: true,
    needsRecompute: false,
  },
  setUlamState: vi.fn(),
  sweepState: { results: null, isComputing: false, error: null, sweepParam: 'a', sweepMin: 0.1, sweepMax: 2.0, numSamples: 10, maxPeriod: 3 },
  setSweepState: vi.fn(),
  wasmModule: null,
  bdeState: { points: [], isRunning: false },
  stepForwardManifold: vi.fn(),
  runToConvergenceManifold: vi.fn(),
  resetManifold: vi.fn(),
  resetBdeFlow: vi.fn()
} satisfies ComponentProps<typeof Sidebar>;

describe('Sidebar', () => {
  beforeEach(() => {
    controlsBarMock.mockClear();
  });

  it('shows the starting point panel for continuous systems', () => {
    render(<Sidebar {...baseProps} type="continuous" dynamicSystem="duffing_ode" />);
    expect(screen.getByTestId('starting-point')).toBeInTheDocument();
  });

  it('shows the starting point panel for discrete systems', () => {
    render(<Sidebar {...baseProps} type="discrete" dynamicSystem="henon" />);
    expect(screen.getByTestId('starting-point')).toBeInTheDocument();
  });

  it('shows periodic search section for discrete boundary systems', () => {
    render(<Sidebar {...baseProps} type="discrete" dynamicSystem="henon" />);
    expect(screen.getByTestId('periodic-search-panel')).toBeInTheDocument();
  });

  it('shows geometric offset controls only for the Hénon boundary map', () => {
    const { rerender } = render(<Sidebar {...baseProps} type="discrete" dynamicSystem="henon" />);
    expect(screen.getByTestId('geometric-offsets-panel')).toBeInTheDocument();

    rerender(<Sidebar {...baseProps} type="discrete" dynamicSystem="duffing" />);
    expect(screen.queryByTestId('geometric-offsets-panel')).toBeNull();
  });

  it('passes recompute controls into the bottom controls bar', () => {
    const onRecompute = vi.fn();
    render(<Sidebar {...baseProps} applyInputsAndRecompute={onRecompute} hasPendingInputChanges={true} />);
    const lastCall = controlsBarMock.mock.calls[controlsBarMock.mock.calls.length - 1];
    expect(lastCall[0].applyInputsAndRecompute).toBe(onRecompute);
    expect(lastCall[0].hasPendingInputChanges).toBe(true);
  });
});
