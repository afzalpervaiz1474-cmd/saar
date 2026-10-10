import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '@/App';
import { NAV_ITEMS } from '@/lib/navigation';

/**
 * Navigation and honesty contract.
 *
 * No native bridge is present in jsdom, which is exactly the "shell missing"
 * case the product must handle truthfully: every page renders, no component is
 * reported as active, and no scan can be started.
 */
describe('ShieldForge console (native bridge absent)', () => {
  it('renders the security overview by default', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /security overview/i })).toBeVisible();
  });

  it('navigates to every page from the sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /main navigation/i });

    for (const item of NAV_ITEMS) {
      await user.click(within(nav).getByRole('button', { name: item.label }));
      expect(await screen.findByRole('heading', { level: 1, name: item.label })).toBeVisible();
    }
  });

  it('never reports a component as active without native confirmation', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /security overview/i });

    // With no native layer there is no snapshot, so the hero must say so
    // instead of falling back to a reassuring label.
    expect(await screen.findByText(/protection status unavailable/i)).toBeVisible();
    expect(screen.queryByText(/all components active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();

    // Scan start is disabled with an honest reason.
    const quickScan = screen.getByRole('button', { name: /quick scan/i });
    expect(quickScan).toBeDisabled();
  });

  it('shows the unavailable state instead of inventing data', async () => {
    render(<App />);
    expect(await screen.findByText(/native protection services unavailable/i, {}, { timeout: 3000 })).toBeVisible();
    expect(screen.getAllByText(/not configured|not implemented|unavailable/i).length).toBeGreaterThan(0);
  });

  it('keeps the theme switcher working and reflects it on the document', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /security overview/i });

    await user.click(screen.getByRole('radio', { name: /light theme/i }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('radio', { name: /dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('records a settings change in Security History', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', { name: /settings & privacy/i }));
    await user.click(await screen.findByRole('button', { name: /^light$/i }));

    await user.click(within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', { name: /security history/i }));
    expect(await screen.findByText(/settings updated/i)).toBeVisible();
  });

  it('renders the quarantine page with an empty, honest vault state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', { name: /^quarantine$/i }));

    expect(await screen.findByText(/quarantine is empty/i)).toBeVisible();
  });

  it('runs the client self-test on About & Diagnostics', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(screen.getByRole('navigation', { name: /main navigation/i })).getByRole('button', { name: /about & diagnostics/i }));
    await user.click(await screen.findByRole('button', { name: /run client self-test/i }));

    const results = await screen.findByText(/assertions passed/i);
    expect(results).toBeVisible();
    expect(results.textContent).toMatch(/^9 of 9/);
  });

  it('exposes the sidebar status area with real environment values', async () => {
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: /sidebar/i });
    expect(within(sidebar).getByText('Native bridge')).toBeVisible();
    expect(within(sidebar).getByText('Not attached')).toBeVisible();
    expect(within(sidebar).getByText(/browser preview/i)).toBeVisible();
  });
});
