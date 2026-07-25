import { describe, expect, it } from 'vitest';
import {
    applyParameterAnimationValue,
    beginPeriodicRefresh,
    capturePeriodicSearchSettings,
    isParameterAnimationStepSettled,
    nextParameterAnimationStep
} from './parameterAnimationSync';

describe('parameter animation synchronization', () => {
    it('applies the same animation value to visible and computed parameters', () => {
        const previous = { a: 0.4, b: 0.3, epsilon: 0.1 };

        expect(applyParameterAnimationValue(previous, 'a', 0.5)).toEqual({
            a: 0.5,
            b: 0.3,
            epsilon: 0.1
        });
    });

    it('captures continuation and all periodic-search controls for the run', () => {
        expect(capturePeriodicSearchSettings({
            gridSize: 24,
            thetaGridSize: 18,
            residualThreshold: 1e-9,
            useContinuation: true,
            ignored: 'not part of the worker contract'
        })).toEqual({
            gridSize: 24,
            thetaGridSize: 18,
            residualThreshold: 1e-9,
            useContinuation: true
        });
    });

    it('keeps the last valid periodic orbit visible during a refresh', () => {
        const orbits = [{ period: 2, points: [[0, 0], [1, 1]] }];
        const refreshed = beginPeriodicRefresh({
            orbits,
            isReady: true,
            showOrbits: true,
            computeMethod: 'grid'
        });

        expect(refreshed.orbits).toBe(orbits);
        expect(refreshed.showOrbits).toBe(true);
        expect(refreshed.isReady).toBe(false);
        expect(refreshed.computeMethod).toBeNull();
    });

    it('computes exactly one parameter step at a time', () => {
        expect(nextParameterAnimationStep({
            baseValue: 0.4,
            currentStep: 1,
            direction: -1,
            rangeValue: 0.2,
            steps: 4
        })).toEqual({ step: 2, value: 0.3 });

        expect(nextParameterAnimationStep({
            baseValue: 0.4,
            currentStep: 4,
            direction: 1,
            rangeValue: 0.2,
            steps: 4
        })).toBeNull();
    });

    it('settles only when periodic and manifold data match the requested revision', () => {
        const animationState = {
            isAnimating: true,
            awaitingResult: true,
            expectedPeriodicRevision: 7
        };
        const periodicState = {
            isReady: true,
            resultRevision: 7,
            renderedRevision: 7
        };
        const manifoldState = {
            isComputing: false,
            sourcePeriodicRevision: 7
        };

        expect(isParameterAnimationStepSettled({
            animationState,
            periodicState,
            manifoldState
        })).toBe(true);

        expect(isParameterAnimationStepSettled({
            animationState,
            periodicState,
            manifoldState: { ...manifoldState, sourcePeriodicRevision: 6 }
        })).toBe(false);

        expect(isParameterAnimationStepSettled({
            animationState,
            periodicState: { ...periodicState, renderedRevision: 6 },
            manifoldState
        })).toBe(false);

        expect(isParameterAnimationStepSettled({
            animationState,
            periodicState: { ...periodicState, isReady: false },
            manifoldState
        })).toBe(false);
    });
});
