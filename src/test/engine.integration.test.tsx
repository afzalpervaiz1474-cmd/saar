import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { COMMANDS } from '@/lib/constants';
import {
  appInfoFixture,
  fixtureScanner,
  progressFixture,
  protectionFixture,
  quarantineItemFixture,
  scanFileFixture,
  summaryFixture,
  updateStatusFixture,
} from '@/test/fixtures';
import type { ComponentState, ProtectionComponent } from '@/types/models';

/**
 * Engine-backed integration tests.
 *
 * The native bridge is replaced with a test double that returns *fixture engine
 * output*. Nothing in the application is allowed to invent data: these tests
 * prove that when the engine does supply values, the UI renders exactly those
 * values - and that failures and cancellations surface honestly.
 */
const h = vi.hoisted(() => ({
  invoke: (async () => {
    throw new Error('no handler configured');
  }) as (command: string, args?: Record<string, unknown>) => Promise<unknown>,
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
}));

vi.mock('@/lib/native/bridge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/native/bridge')>(
    '@/lib/native/bridge',
  );
  const bridge = {
    kind: 'tauri' as const,
    invoke: async <T,>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
      h.calls.push({ command, args });
      return (await h.invoke(command, args)) as T;
    },
  };
  return {
    ...actual,
    bridge,
    getBridge: () => bridge,
    detectBridgeKind: () => 'tauri' as const,
  };
});

type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

function route(handlers: Record<string, Handler | undefined>): void {
  h.invoke = async (command, args = {}) => {
    const handler = handlers[command];
    if (!handler) throw new Error(`unexpected command: ${command}`);
    return handler(args);
  };
}

/** The sidebar mirrors the hero label, so page assertions are scoped to <main>. */
function main(): HTMLElement {
  return screen.getByRole('main');
}

/** Hero headline (the badge next to it repeats the same wording). */
function findHeroHeading(pattern: RegExp): Promise<HTMLElement> {
  return within(main()).findByRole('heading', { name: pattern });
}

/** Clicks Start scan once the scanner descriptor has actually loaded. */
async function startScan(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const button = await screen.findByRole('button', { name: /^start scan$/i });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

function engineError(message: string): unknown {
  return { code: 'engine_error', message, hint: 'Check the engine installation.', traceId: 'tr-1' };
}

function allActiveSnapshot() {
  const components: ProtectionComponent[] = protectionFixture().components.map((component) => ({
    ...component,
    state: 'active' as ComponentState,
    version: '0.1.0',
    detail: 'Self-check passed.',
  }));
  return protectionFixture({ components, fullyOperational: true, engineConfigured: true });
}

beforeEach(() => {
  h.calls = [];
});

describe('with a configured, engine-backed native layer', () => {
  it('renders real component states and only then shows the green "all active" badge', async () => {
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () =>
        updateStatusFixture({ state: 'up_to_date', installedSignatureVersion: 'sig-2026-10-10' }),
      [COMMANDS.quarantineList]: () => [],
    });

    render(<App />);

    expect(await findHeroHeading(/all components active/i)).toBeVisible();
    expect(
      within(main()).getByText(/every implemented protection component reported an active state/i),
    ).toBeVisible();

    const sidebar = screen.getByRole('complementary', { name: /sidebar/i });
    expect(within(sidebar).getByText('Attached')).toBeVisible();
    expect(screen.getByText('sig-2026-10-10')).toBeVisible();
  });

  it('shows "partial protection" when the engine exists but a component is not active', async () => {
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => protectionFixture({ engineConfigured: true }),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
    });

    render(<App />);
    expect(await findHeroHeading(/partial protection/i)).toBeVisible();
    expect(within(main()).queryByRole('heading', { name: /all components active/i })).toBeNull();
  });

  it('runs a scan and renders the engine’s own results', async () => {
    const user = userEvent.setup();
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
      [COMMANDS.scanStart]: () => progressFixture({ status: 'completed' }),
      [COMMANDS.scanProgress]: () => progressFixture({ status: 'completed' }),
      [COMMANDS.scanResults]: () => summaryFixture(),
    });

    render(<App />);
    await findHeroHeading(/all components active/i);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    await user.click(within(nav).getByRole('button', { name: /scan center/i }));

    await startScan(user);

    // Progress panel shows the engine counters.
    await waitFor(() => expect(screen.getByText('Completed')).toBeVisible());
    expect(screen.getByText('Result set ready.')).toBeVisible();

    // Results page lists per-file verdicts exactly as supplied.
    await user.click(within(nav).getByRole('button', { name: /scan results/i }));
    expect(await screen.findByText('Fixture.TestMarker-1')).toBeVisible();
    expect(screen.getAllByText('Clean').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unsupported').length).toBeGreaterThan(0);
    expect(screen.getByText(/Objects scanned/i)).toBeVisible();
  });

  it('reports a failed scan instead of inventing results', async () => {
    const user = userEvent.setup();
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
      [COMMANDS.scanStart]: () => {
        throw engineError('Scanner engine crashed while opening the target.');
      },
    });

    render(<App />);
    await findHeroHeading(/all components active/i);

    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan center/i,
      }),
    );
    await startScan(user);

    expect(await screen.findByText(/scanner engine crashed while opening the target/i)).toBeVisible();
    expect(screen.getByText(/check the engine installation/i)).toBeVisible();

    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan results/i,
      }),
    );
    expect(await screen.findByText(/no results to display/i)).toBeVisible();
  });

  it('cancels a running scan and reports the cancelled state', async () => {
    const user = userEvent.setup();
    let cancelCalls = 0;
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
      [COMMANDS.scanStart]: () => progressFixture({ status: 'running', finishedAt: null }),
      [COMMANDS.scanProgress]: () => progressFixture({ status: 'running', finishedAt: null }),
      [COMMANDS.scanCancel]: () => {
        cancelCalls += 1;
        return progressFixture({ status: 'cancelled' });
      },
      [COMMANDS.scanResults]: () => summaryFixture({ status: 'cancelled' }),
    });

    render(<App />);
    await findHeroHeading(/all components active/i);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan center/i,
      }),
    );

    await startScan(user);
    await user.click(await screen.findByRole('button', { name: /cancel scan/i }));

    await waitFor(() => expect(cancelCalls).toBe(1));
    await waitFor(() => expect(screen.getByText('Cancelled')).toBeVisible());

    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /security history/i,
      }),
    );
    // The history records both the user request and the engine result.
    const historyEntries = await screen.findAllByText(/scan cancelled/i);
    expect(historyEntries.length).toBeGreaterThan(0);
  });

  it('requires typed confirmation before permanently deleting a quarantined item', async () => {
    const user = userEvent.setup();
    let deleted: string | null = null;
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [quarantineItemFixture()],
      [COMMANDS.quarantineDelete]: (args) => {
        deleted = String(args['id']);
        return [];
      },
    });

    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /^quarantine$/i,
      }),
    );

    expect(await screen.findByText('Fixture.TestMarker-1')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /delete permanently/i });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type delete to confirm/i), 'delete');
    expect(confirm).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/type delete to confirm/i));
    await user.type(within(dialog).getByLabelText(/type delete to confirm/i), 'DELETE');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(deleted).toBe('qtn_fixture01'));
    expect(await screen.findByText(/quarantine is empty/i)).toBeVisible();
  });

  it('marks the scan controls unavailable when no engine is configured', async () => {
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => protectionFixture(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(false),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
    });

    render(<App />);
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan center/i,
      }),
    );

    expect(await screen.findAllByText(/scanner not configured/i)).not.toHaveLength(0);
    const start = screen.getByRole('button', { name: /^start scan$/i });
    expect(start).toBeDisabled();
    expect(screen.getByText(/no engine is available to run this scan/i)).toBeVisible();
  });

  it('rejects an invalid custom path before it reaches the native layer', async () => {
    const user = userEvent.setup();
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
    });

    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan center/i,
      }),
    );
    await user.click(await screen.findByRole('button', { name: /custom location/i }));

    await user.type(screen.getByLabelText(/folder path/i), '../../etc');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByText(/relative segments/i)).toBeVisible();
    expect(h.calls.filter((call) => call.command === COMMANDS.scanStart)).toHaveLength(0);
  });

  it('shows engine-supplied update versions and reports an update failure honestly', async () => {
    const user = userEvent.setup();
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () =>
        updateStatusFixture({
          state: 'up_to_date',
          engineVersion: '1.4.2',
          installedSignatureVersion: '27100',
          signaturesVerified: true,
          lastSuccessAt: '2026-10-09T09:00:00.000Z',
        }),
      [COMMANDS.updateCheck]: () => {
        throw engineError('Update server certificate validation failed.');
      },
      [COMMANDS.quarantineList]: () => [],
    });

    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /update center/i,
      }),
    );

    expect(await screen.findByText('1.4.2')).toBeVisible();
    expect(screen.getByText('27100')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/update server certificate validation failed/i)).toBeVisible();
    // A failed check must never leave a stale "up to date" impression.
    expect(screen.queryByText(/signature data is current/i)).not.toBeInTheDocument();
  });

  it('distinguishes clean, detected, unsupported and error verdicts in the filter counts', async () => {
    const user = userEvent.setup();
    route({
      [COMMANDS.appInfo]: () => appInfoFixture(),
      [COMMANDS.protectionStatus]: () => allActiveSnapshot(),
      [COMMANDS.scannerDescriptor]: () => fixtureScanner(true),
      [COMMANDS.updateStatus]: () => updateStatusFixture(),
      [COMMANDS.quarantineList]: () => [],
      [COMMANDS.scanStart]: () => progressFixture({ status: 'completed' }),
      [COMMANDS.scanProgress]: () => progressFixture({ status: 'completed' }),
      [COMMANDS.scanResults]: () =>
        summaryFixture({
          files: [
            scanFileFixture(),
            scanFileFixture({ path: 'C:\\a\\b.bin', verdict: 'detected' }),
            scanFileFixture({ path: 'C:\\a\\c.img', verdict: 'unsupported', reason: 'image' }),
            scanFileFixture({ path: 'C:\\a\\d.db', verdict: 'error', reason: 'locked' }),
          ],
        }),
    });

    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan center/i,
      }),
    );
    await startScan(user);
    await screen.findByText(/result set ready/i);
    await user.click(
      within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', {
        name: /scan results/i,
      }),
    );
    await screen.findByRole('heading', { level: 1, name: /scan results/i });

    const detectedTab = await screen.findByRole('button', { name: /detected/i });
    await user.click(detectedTab);
    expect(screen.getAllByText('Detected').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /errors & unsupported/i }));
    expect(screen.getAllByText('Unsupported').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
  });
});
