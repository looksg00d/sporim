import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldButton } from './HoldButton';

function press(element: HTMLElement) {
  fireEvent.pointerDown(element);
}
function release(element: HTMLElement) {
  fireEvent.pointerUp(element);
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('HoldButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires only after the full hold duration', () => {
    const onComplete = vi.fn();
    render(<HoldButton onComplete={onComplete}>Hold to lock in</HoldButton>);
    const button = screen.getByRole('button');

    press(button);
    advance(760);
    expect(onComplete).not.toHaveBeenCalled();

    advance(80);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does nothing when released early', () => {
    const onComplete = vi.fn();
    render(<HoldButton onComplete={onComplete}>Hold to lock in</HoldButton>);
    const button = screen.getByRole('button');

    press(button);
    advance(400);
    release(button);
    advance(2_000);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cancels when the pointer leaves the button', () => {
    const onComplete = vi.fn();
    render(<HoldButton onComplete={onComplete}>Hold to lock in</HoldButton>);
    const button = screen.getByRole('button');

    press(button);
    advance(500);
    fireEvent.pointerLeave(button);
    advance(2_000);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('fires exactly once even if the pointer is held far longer', () => {
    const onComplete = vi.fn();
    render(<HoldButton onComplete={onComplete}>Hold to lock in</HoldButton>);
    const button = screen.getByRole('button');

    press(button);
    advance(5_000);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled', () => {
    const onComplete = vi.fn();
    render(
      <HoldButton onComplete={onComplete} disabled>
        Hold to lock in
      </HoldButton>,
    );
    const button = screen.getByRole('button');

    press(button);
    advance(2_000);

    expect(onComplete).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('can be held with the keyboard', () => {
    const onComplete = vi.fn();
    render(<HoldButton onComplete={onComplete}>Hold to lock in</HoldButton>);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: ' ' });
    advance(900);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('respects a custom hold duration', () => {
    const onComplete = vi.fn();
    render(
      <HoldButton onComplete={onComplete} holdMs={2_000}>
        Hold
      </HoldButton>,
    );
    const button = screen.getByRole('button');

    press(button);
    advance(1_000);
    expect(onComplete).not.toHaveBeenCalled();

    advance(1_100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reports progress to assistive technology', () => {
    render(<HoldButton onComplete={vi.fn()}>Hold</HoldButton>);
    const button = screen.getByRole('button');

    press(button);
    advance(400);

    const progressbar = screen.getByRole('progressbar', { hidden: true });
    expect(Number(progressbar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  });
});
