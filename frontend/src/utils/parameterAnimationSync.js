export const beginPeriodicRefresh = (previousState) => ({
    ...previousState,
    isReady: false,
    computeMethod: null
});

export const applyParameterAnimationValue = (previousParams, parameter, value) => ({
    ...previousParams,
    [parameter]: value
});

export const capturePeriodicSearchSettings = (settings) => ({
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
}) => {
    if (!Number.isFinite(baseValue) || !Number.isFinite(rangeValue) || steps <= 0 || currentStep >= steps) {
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
}) => {
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
