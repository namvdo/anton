import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimationPanel } from './AnimationPanel';

const animationState = {
  isAnimating: false,
  parameter: 'a',
  direction: 1,
  rangeValue: 0.1,
  steps: 10,
  currentStep: 0,
  baseValue: null,
  targetValue: null
};

const renderPanel = ({ periodicRevision = 4, manifoldRevision = 4, isComputing = false } = {}) => {
  render(
    <AnimationPanel
      animationState={animationState}
      setAnimationState={vi.fn()}
      manifoldState={{
        isComputing,
        sourcePeriodicRevision: manifoldRevision
      }}
      periodicState={{
        isReady: true,
        resultRevision: periodicRevision,
        renderedRevision: periodicRevision
      }}
      recordingState={{
        recordingEnabled: false,
        isEncoding: false,
        frameCount: 0
      }}
      startAnimation={vi.fn()}
      stopAnimation={vi.fn()}
      toggleRecording={vi.fn()}
    />
  );
};

describe('AnimationPanel', () => {
  it('enables Play when periodic and manifold results are synchronized', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: '▶ Play' })).toBeEnabled();
  });

  it('disables Play while manifold data belongs to an older periodic result', () => {
    renderPanel({ periodicRevision: 5, manifoldRevision: 4 });

    expect(screen.getByRole('button', { name: '▶ Play' })).toBeDisabled();
  });

  it('disables Play until periodic points have been rendered', () => {
    render(
      <AnimationPanel
        animationState={animationState}
        setAnimationState={vi.fn()}
        manifoldState={{ isComputing: false, sourcePeriodicRevision: 5 }}
        periodicState={{ isReady: true, resultRevision: 5, renderedRevision: 4 }}
        recordingState={{ recordingEnabled: false, isEncoding: false, frameCount: 0 }}
        startAnimation={vi.fn()}
        stopAnimation={vi.fn()}
        toggleRecording={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '▶ Play' })).toBeDisabled();
  });
});
