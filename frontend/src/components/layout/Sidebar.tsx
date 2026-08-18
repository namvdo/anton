import type { Dispatch, SetStateAction } from 'react';
import { SystemPicker } from '../sidebar/SystemPicker';
import { EquationDisplay } from '../sidebar/EquationDisplay';
import { ParametersPanel } from '../sidebar/ParametersPanel';
import { ManifoldsPanel } from '../sidebar/ManifoldsPanel';
import { VisualizationPanel } from '../sidebar/VisualizationPanel';
import { StartingPoint } from '../sidebar/StartingPoint';
import { PeriodicOrbitsPanel } from '../sidebar/PeriodicOrbitsPanel';
import { PeriodicSearchPanel } from '../sidebar/PeriodicSearchPanel';
import { UlamPanel } from '../sidebar/UlamPanel';
import { AnimationPanel } from '../sidebar/AnimationPanel';
import { ParameterSweepPanel } from '../sidebar/ParameterSweepPanel';
import { GeometricOffsetsPanel } from '../sidebar/GeometricOffsetsPanel';
import { ExperimentPanel } from '../sidebar/ExperimentPanel';
import { InfoStrip } from './InfoStrip';
import { ControlsBar } from './ControlsBar';
import { BIST_VERSION } from '../../config/systems';
import type { BoundarySamplingSummary } from '../../utils/boundaryLayers';
import type {
  AnimationState,
  BdeState,
  BistParameters,
  BistWasmModule,
  CustomEquations,
  CustomParameter,
  ExperimentStatus,
  GeometricOffsetState,
  ManifoldState,
  OrbitFilters,
  PeriodicSearchSettings,
  PeriodicState,
  RecordingState,
  StateSetter,
  SweepState,
  SystemCatalog,
  SystemId,
  SystemType,
  UlamState,
  ViewRange,
} from '../../types/domain';

interface SidebarProps {
  type: SystemType;
  setType: (type: SystemType) => void;
  dynamicSystem: SystemId;
  setDynamicSystem: (systemId: SystemId) => void;
  SYSTEMS: SystemCatalog;
  exportExperiment: () => void;
  importExperiment: (contents: string) => void | Promise<void>;
  experimentStatus: ExperimentStatus | null;
  customEquations: CustomEquations;
  setCustomEquations: StateSetter<CustomEquations>;
  equationError: string | null;
  params: BistParameters;
  setParams: StateSetter<BistParameters>;
  applyPreset: (values: Partial<BistParameters>) => void;
  customParams: CustomParameter[];
  setCustomParams: Dispatch<SetStateAction<CustomParameter[]>>;
  paramErrors: Array<string | null>;
  hasPendingInputChanges: boolean;
  applyInputsAndRecompute: () => void;
  appliedParams?: BistParameters;
  viewRange: ViewRange;
  setViewRange: (patch: Partial<ViewRange>) => void;
  rangeLimit: number;
  resetViewRange: () => void;
  manifoldState: ManifoldState;
  setManifoldState: StateSetter<ManifoldState>;
  geometricOffsetState: GeometricOffsetState;
  setGeometricOffsetState: StateSetter<GeometricOffsetState>;
  hasClosedMisBoundary: boolean;
  boundaryLayerError: string | null;
  boundarySampling: {
    unstable: BoundarySamplingSummary | null;
    deterministic: BoundarySamplingSummary | null;
  };
  canComputeGeometricOffsets: boolean;
  computeGeometricOffsets: () => void;
  canComputeInverseGeometricOffsets: boolean;
  computeInverseGeometricOffsets: () => void;
  fitInverseGeometricOffsets: () => void;
  ORBIT_COLORS: { manifold: string; stableManifold: string };
  filters: OrbitFilters;
  setFilters: StateSetter<OrbitFilters>;
  periodicState: PeriodicState;
  periodicSearchSettings: PeriodicSearchSettings;
  appliedPeriodicSearchSettings: PeriodicSearchSettings;
  updatePeriodicSearchSettings: (patch: Partial<PeriodicSearchSettings>) => void;
  runPeriodicGridSearch: () => void;
  updateStartPoint: (point: ManifoldState['startPoint']) => void;
  animationState: AnimationState;
  setAnimationState: StateSetter<AnimationState>;
  recordingState: RecordingState;
  startAnimation: () => void;
  stopAnimation: () => void;
  toggleRecording: () => void;
  ulamState: UlamState;
  setUlamState: StateSetter<UlamState>;
  wasmModule: BistWasmModule | null;
  sweepState: SweepState;
  setSweepState: StateSetter<SweepState>;
  bdeState: BdeState;
  stepForwardManifold: () => void;
  runToConvergenceManifold: () => void;
  resetManifold: () => void;
  resetBdeFlow: () => void;
}

export const Sidebar = (props: SidebarProps) => {
  const { ORBIT_COLORS } = props;
  const logoSrc = `${import.meta.env.BASE_URL}bist_logo.png`;
  const animationLocksConfiguration = Boolean(
    props.animationState?.isAnimating || props.animationState?.isPreparing
  );

  return (
    <div className="sidebar">
      <div className="app-name">
        <img className="app-logo" src={logoSrc} alt="" aria-hidden="true" />
        <span>BIST</span>
        <span className="app-version">v{BIST_VERSION}</span>
      </div>

      <div className="sidebar-scroll">
        <SystemPicker
          type={props.type}
          setType={props.setType}
          systemId={props.dynamicSystem}
          setSystemId={props.setDynamicSystem}
          systems={props.SYSTEMS}
          disabled={animationLocksConfiguration}
        />

        <ExperimentPanel
          onExport={props.exportExperiment}
          onImport={props.importExperiment}
          status={props.experimentStatus}
        />

        <EquationDisplay
          systemId={props.dynamicSystem}
          customEquations={props.customEquations}
          setCustomEquations={props.setCustomEquations}
          equationError={props.equationError}
          disabled={props.manifoldState.isRunning || animationLocksConfiguration}
        />

        <ParametersPanel
          systemId={props.dynamicSystem}
          params={props.params}
          setParams={props.setParams}
          disabled={props.manifoldState.isRunning || animationLocksConfiguration}
          systems={props.SYSTEMS}
          applyPreset={props.applyPreset}
          customParams={props.customParams}
          setCustomParams={props.setCustomParams}
          paramErrors={props.paramErrors}
        />

        {props.type === 'discrete' && (
          <PeriodicSearchPanel
            dynamicSystem={props.dynamicSystem}
            periodicSearchSettings={props.periodicSearchSettings}
            appliedPeriodicSearchSettings={props.appliedPeriodicSearchSettings}
            maxPeriod={props.params.maxPeriod}
            appliedMaxPeriod={(props.appliedParams || props.params).maxPeriod}
            appliedParameters={props.appliedParams || props.params}
            viewRange={props.viewRange}
            periodicState={props.periodicState}
            updatePeriodicSearchSettings={props.updatePeriodicSearchSettings}
            updateMaxPeriod={maxPeriod => props.setParams(previous => ({ ...previous, maxPeriod }))}
            runGridSearch={props.runPeriodicGridSearch}
            hasPendingChanges={props.hasPendingInputChanges}
            disabled={props.manifoldState.isRunning || animationLocksConfiguration}
          />
        )}

        <VisualizationPanel
          viewRange={props.viewRange}
          setViewRange={props.setViewRange}
          rangeLimit={props.rangeLimit}
          resetViewRange={props.resetViewRange}
        />

        <StartingPoint
          type={props.type}
          startPoint={props.manifoldState.startPoint}
          updateStartPoint={props.updateStartPoint}
          disabled={props.manifoldState.isRunning || animationLocksConfiguration}
        />

        {props.type === 'discrete' && (
          <>
            <ManifoldsPanel
              manifoldState={props.manifoldState}
              setManifoldState={props.setManifoldState}
              ORBIT_COLORS={ORBIT_COLORS}
              hasClosedMisBoundary={props.hasClosedMisBoundary}
              boundaryLayerError={props.boundaryLayerError}
              boundarySampling={props.boundarySampling}
              systemEpsilon={(props.appliedParams || props.params).epsilon}
            />
            {props.dynamicSystem === 'henon' && (
              <>
                <GeometricOffsetsPanel
                  state={props.geometricOffsetState}
                  setState={props.setGeometricOffsetState}
                  systemEpsilon={props.params.epsilon}
                  canCompute={props.canComputeGeometricOffsets}
                  compute={props.computeGeometricOffsets}
                  canComputeInverse={props.canComputeInverseGeometricOffsets}
                  computeInverse={props.computeInverseGeometricOffsets}
                  fitInverse={props.fitInverseGeometricOffsets}
                />
              </>
            )}
            <PeriodicOrbitsPanel
              manifoldState={props.manifoldState}
              setManifoldState={props.setManifoldState}
              filters={props.filters}
              setFilters={props.setFilters}
              periodicState={props.periodicState}
            />
          </>
        )}

        {props.type === 'discrete' && props.dynamicSystem !== 'custom' && (
          <AnimationPanel
            animationState={props.animationState}
            setAnimationState={props.setAnimationState}
            manifoldState={props.manifoldState}
            periodicState={props.periodicState}
            recordingState={props.recordingState}
            startAnimation={props.startAnimation}
            stopAnimation={props.stopAnimation}
            toggleRecording={props.toggleRecording}
          />
        )}

        {props.type === 'discrete' && (
          <ParameterSweepPanel
            wasmModule={props.wasmModule}
            params={props.params}
            viewRange={props.viewRange}
            sweepState={props.sweepState}
            setSweepState={props.setSweepState}
            dynamicSystem={props.dynamicSystem}
            customEquations={props.customEquations}
            customParams={props.customParams}
          />
        )}

        <UlamPanel
          ulamState={props.ulamState}
          setUlamState={props.setUlamState}
        />

      </div>

      <InfoStrip
        type={props.type}
        manifoldState={props.manifoldState}
        params={props.appliedParams || props.params}
        periodicState={props.periodicState}
      />

      <ControlsBar
        dynamicSystem={props.dynamicSystem}
        manifoldState={props.manifoldState}
        bdeState={props.bdeState}
        stepForwardManifold={props.stepForwardManifold}
        runToConvergenceManifold={props.runToConvergenceManifold}
        resetManifold={props.resetManifold}
        resetBdeFlow={props.resetBdeFlow}
        applyInputsAndRecompute={props.applyInputsAndRecompute}
        hasPendingInputChanges={props.hasPendingInputChanges}
      />
    </div>
  );
};
