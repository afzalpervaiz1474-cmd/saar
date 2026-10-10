import { describe, expect, it } from 'vitest';
import {
  COMPONENT_PRESENTATION,
  overallTone,
  SCAN_STATUS_PRESENTATION,
  UPDATE_PRESENTATION,
  VERDICT_PRESENTATION,
} from '@/lib/statusTone';
import { protectionFixture } from '@/test/fixtures';
import type { ComponentState } from '@/types/models';

/**
 * These tests enforce the product rule that the UI must never paint a
 * non-confirmed component green.
 */
describe('status → tone mapping', () => {
  it('maps only "active" to the ok tone', () => {
    const okStates = Object.entries(COMPONENT_PRESENTATION)
      .filter(([, presentation]) => presentation.tone === 'ok')
      .map(([state]) => state);
    expect(okStates).toEqual(['active']);
  });

  it('gives every component state a distinct, non-ok label', () => {
    const states: ComponentState[] = [
      'active',
      'degraded',
      'not_implemented',
      'not_configured',
      'permission_required',
      'unavailable',
      'error',
    ];
    for (const state of states) {
      const presentation = COMPONENT_PRESENTATION[state];
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.description.length).toBeGreaterThan(0);
      if (state !== 'active') expect(presentation.tone).not.toBe('ok');
    }
  });

  it('maps only a completed scan to ok, and never "unavailable"', () => {
    expect(SCAN_STATUS_PRESENTATION.completed.tone).toBe('ok');
    for (const status of ['idle', 'starting', 'running', 'cancelling', 'cancelled', 'failed', 'unavailable'] as const) {
      expect(SCAN_STATUS_PRESENTATION[status].tone).not.toBe('ok');
    }
    expect(SCAN_STATUS_PRESENTATION.unavailable.label).toBe('Unavailable');
  });

  it('does not treat a failed update as healthy', () => {
    expect(UPDATE_PRESENTATION.up_to_date.tone).toBe('ok');
    expect(UPDATE_PRESENTATION.not_configured.tone).toBe('info');
    expect(UPDATE_PRESENTATION.failed.tone).toBe('danger');
    expect(UPDATE_PRESENTATION.unavailable.tone).toBe('neutral');
  });

  it('labels clean verdicts without claiming safety', () => {
    expect(VERDICT_PRESENTATION.clean.tone).toBe('ok');
    expect(VERDICT_PRESENTATION.clean.description).toMatch(/not a guarantee/i);
    expect(VERDICT_PRESENTATION.error.tone).not.toBe('ok');
    expect(VERDICT_PRESENTATION.unsupported.tone).not.toBe('ok');
  });
});

describe('overallTone', () => {
  it('is only green when every component reports active', () => {
    const allActive = protectionFixture({
      components: protectionFixture().components.map((component) => ({
        ...component,
        state: 'active' as ComponentState,
      })),
      fullyOperational: true,
      engineConfigured: true,
    });
    expect(overallTone(allActive).tone).toBe('ok');
  });

  it('is neutral while no engine is configured, even if one component is active', () => {
    const snapshot = protectionFixture({ engineConfigured: false, fullyOperational: false });
    // audit_log is active in the fixture, but the engine is not configured.
    expect(snapshot.components.some((component) => component.state === 'active')).toBe(true);
    expect(overallTone(snapshot).tone).toBe('neutral');
    expect(overallTone(snapshot).label).toMatch(/not configured/i);
  });

  it('is a warning when the engine exists but something is not active', () => {
    expect(overallTone({ fullyOperational: false, engineConfigured: true }).tone).toBe('warn');
  });
});
