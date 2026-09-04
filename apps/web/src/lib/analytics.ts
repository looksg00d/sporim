import type { BetFormat, DecisionMode, WizardStep } from '@sporim/domain';

/**
 * Typed events only. A funnel assembled from free-form strings drifts within a week —
 * `wizard_step` and `wizardStep` become two funnels and neither one is right — so the
 * event name is a union and the payload is typed per event.
 *
 * Nothing is sent yet; PostHog arrives in M4 (T4.2). Until then this is the seam, and the
 * rule it enforces is the point: **no event ever carries the terms of a bet, a handle, an
 * amount, or anything else a person wrote.** Counts and enums only.
 */

export type AnalyticsEvent =
  | { readonly name: 'wizard_started'; readonly ref: string | null }
  | { readonly name: 'wizard_step_completed'; readonly step: WizardStep }
  | { readonly name: 'wizard_step_blocked'; readonly step: WizardStep; readonly reason: string }
  | { readonly name: 'wizard_abandoned'; readonly step: WizardStep }
  | { readonly name: 'format_selected'; readonly format: BetFormat }
  | { readonly name: 'stake_selected'; readonly preset: number | 'custom' }
  | { readonly name: 'deadline_selected'; readonly preset: string | 'custom' }
  | { readonly name: 'decision_mode_selected'; readonly mode: DecisionMode }
  | { readonly name: 'hold_started' }
  | { readonly name: 'hold_cancelled'; readonly heldMs: number }
  /** The commit button asked for a session instead of submitting. Not a failure — a gate. */
  | { readonly name: 'login_required' }
  | { readonly name: 'bet_create_submitted'; readonly format: BetFormat }
  | { readonly name: 'bet_create_succeeded'; readonly format: BetFormat }
  | { readonly name: 'bet_create_failed'; readonly code: string }
  | { readonly name: 'draft_restored'; readonly step: WizardStep };

export type AnalyticsEventName = AnalyticsEvent['name'];

export type AnalyticsSink = (event: AnalyticsEvent) => void;

const sinks: AnalyticsSink[] = [];

/** M4 registers the PostHog sink here; tests register a recorder. */
export function addAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}

/** Analytics must never be able to break a screen. */
export function track(event: AnalyticsEvent): void {
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // A dropped event is not worth a broken wizard.
    }
  }
}

/** Exported for the test that asserts no event name drifts from this list. */
export const ANALYTICS_EVENT_NAMES = [
  'wizard_started',
  'wizard_step_completed',
  'wizard_step_blocked',
  'wizard_abandoned',
  'format_selected',
  'stake_selected',
  'deadline_selected',
  'decision_mode_selected',
  'hold_started',
  'hold_cancelled',
  'login_required',
  'bet_create_submitted',
  'bet_create_succeeded',
  'bet_create_failed',
  'draft_restored',
] as const satisfies readonly AnalyticsEventName[];
