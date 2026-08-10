import type {
    AnimationState,
    BistParameters,
    ManifoldState,
    PeriodicSearchSettings,
    PeriodicState,
} from '../types/domain';

export const beginPeriodicRefresh = <T extends Pick<PeriodicState, 'isReady' | 'computeMethod'>>(
    previousState: T,
): T => ({
    ...previousState,
    isReady: false,
    computeMethod: null
} as T);

export const applyParameterAnimationValue = <T extends Pick<BistParameters, AnimationState['parameter']>>(
    previousParams: T,
    parameter: AnimationState['parameter'],
    value: number,
): T => ({
    ...previousParams,
    [parameter]: value
} as T);

export const capturePeriodicSearchSettings = <T extends PeriodicSearchSettings>(
    settings: T,
): PeriodicSearchSettings => ({
    gridSize: settings.gridSize,
    thetaGridSize: settings.thetaGridSize,
    residualThreshold: settings.residualThreshold,
    useContinuation: Boolean(settings.useContinuation)
});

export const nextParameterAnimationStep = ({
    baseValue,
    currentStep,
    direction,
    rangeValue,
    steps
}: Pick<AnimationState, 'baseValue' | 'currentStep' | 'direction' | 'rangeValue' | 'steps'>): {
    step: number;
    value: number;
} | null => {
    if (typeof baseValue !== 'number' || !Number.isFinite(baseValue)
        || !Number.isFinite(rangeValue) || steps <= 0 || currentStep >= steps) {
        return null;
    }

    const nextStep = currentStep + 1;
    const stepSize = rangeValue / steps;
    const value = baseValue + (direction * stepSize * nextStep);

    return {
        step: nextStep,
        value: Number(value.toFixed(4))
    };
};

export const isParameterAnimationStepSettled = ({
    animationState,
    periodicState,
    manifoldState
}: {
    animationState: Pick<AnimationState, 'expectedPeriodicRevision' | 'isAnimating' | 'awaitingResult'>;
    periodicState: Pick<PeriodicState, 'isReady' | 'resultRevision' | 'renderedRevision'>;
    manifoldState: Pick<ManifoldState, 'isComputing' | 'sourcePeriodicRevision'>;
}): boolean => {
    const expectedRevision = animationState.expectedPeriodicRevision;

    return animationState.isAnimating
        && animationState.awaitingResult
        && Number.isInteger(expectedRevision)
        && periodicState.isReady
        && periodicState.resultRevision === expectedRevision
        && periodicState.renderedRevision === expectedRevision
        && !manifoldState.isComputing
        && manifoldState.sourcePeriodicRevision === expectedRevision;
};
