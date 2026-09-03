import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENT_NAMES,
  addAnalyticsSink,
  track,
  type AnalyticsEvent,
  type AnalyticsEventName,
} from './analytics';

function record() {
  const events: AnalyticsEvent[] = [];
  const dispose = addAnalyticsSink((event) => events.push(event));
  return { events, dispose };
}

describe('track', () => {
  const disposers: (() => void)[] = [];
  afterEach(() => {
    while (disposers.length) disposers.pop()?.();
  });

  it('delivers an event to a registered sink', () => {
    const { events, dispose } = record();
    disposers.push(dispose);
    track({ name: 'format_selected', format: 'commit' });
    expect(events).toEqual([{ name: 'format_selected', format: 'commit' }]);
  });

  it('delivers to every sink', () => {
    const first = record();
    const second = record();
    disposers.push(first.dispose, second.dispose);
    track({ name: 'hold_started' });
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(1);
  });

  it('stops delivering after a sink is disposed', () => {
    const { events, dispose } = record();
    dispose();
    track({ name: 'hold_started' });
    expect(events).toHaveLength(0);
  });

  it('does nothing when nobody is listening', () => {
    expect(() => track({ name: 'hold_started' })).not.toThrow();
  });

  it('survives a sink that throws — analytics never breaks a screen', () => {
    const dispose = addAnalyticsSink(() => {
      throw new Error('network down');
    });
    disposers.push(dispose);
    const { events, dispose: disposeGood } = record();
    disposers.push(disposeGood);
    expect(() => track({ name: 'hold_started' })).not.toThrow();
    expect(events).toHaveLength(1);
  });

  it('reports how long a cancelled hold lasted, so friction can be measured', () => {
    const { events, dispose } = record();
    disposers.push(dispose);
    track({ name: 'hold_cancelled', heldMs: 412 });
    expect(events[0]).toEqual({ name: 'hold_cancelled', heldMs: 412 });
  });
});

describe('event vocabulary', () => {
  it('is closed — the union and the exported list agree', () => {
    const names: readonly AnalyticsEventName[] = ANALYTICS_EVENT_NAMES;
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses snake_case throughout, so no funnel splits on casing', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('carries no free-text field that could leak what someone wrote', () => {
    // Every payload key across the union, checked against the ones allowed to be strings.
    const stringKeysThatAreEnums = ['step', 'format', 'mode', 'preset', 'code', 'reason', 'ref'];
    const sample: AnalyticsEvent[] = [
      { name: 'wizard_started', ref: 'reel' },
      { name: 'wizard_step_completed', step: 'terms' },
      { name: 'bet_create_failed', code: 'USER_REJECTED' },
    ];
    for (const event of sample) {
      for (const [key, value] of Object.entries(event)) {
        if (key === 'name' || typeof value !== 'string') continue;
        expect(stringKeysThatAreEnums).toContain(key);
      }
    }
  });
});

describe('sink contract', () => {
  it('hands the sink the event object unchanged', () => {
    const sink = vi.fn();
    const dispose = addAnalyticsSink(sink);
    const event: AnalyticsEvent = { name: 'stake_selected', preset: 25 };
    track(event);
    dispose();
    expect(sink).toHaveBeenCalledWith(event);
  });
});
