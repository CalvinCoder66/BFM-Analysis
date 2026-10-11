import { render, screen, within } from '@testing-library/react';
import { kmhToMs } from '../../physics/units';
import { sideConfig, testScenario } from '../../test/scenarios';
import { MatchupTable } from './MatchupTable';
import { computeMatchup } from './matchup';

const row = (label: string) =>
  screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;
const renderTable = (m: ReturnType<typeof computeMatchup>, mergeLabel = '800 km/h') =>
  render(<MatchupTable matchup={m} unit="kmh" mergeLabel={mergeLabel} turnDuration_s={20} />);

describe('MatchupTable', () => {
  it('lists both aircraft and highlights the better value per metric', () => {
    const m = computeMatchup(testScenario());
    renderTable(m);
    expect(screen.getByRole('columnheader', { name: 'F-16C Block 50' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'MiG-29 (9-12)' })).toBeInTheDocument();
    expect(screen.getByText(/At merge · 800 km\/h/)).toBeInTheDocument();
    expect(screen.getByText(/After 20 s turning · as flown/)).toBeInTheDocument();

    // Mock data: the F-16C wins on sustained rate, the MiG-29 on minimum radius.
    expect(within(row('Best STR')).getAllByText('(advantage)')).toHaveLength(1);
    expect(row('Best STR').querySelector('[data-best]')?.textContent).toContain(
      `${m.attacker.flown.summary.maxStr.value.toFixed(1)}°/s`,
    );
    expect(row('Min radius').querySelector('[data-best]')?.textContent).toContain(
      `${Math.round(m.defender.pull.summary.minRadius.value)} m`,
    );
  });

  it('shows the G limits: instructor limit, pilot G and wing-break G', () => {
    renderTable(computeMatchup(testScenario({ attacker: sideConfig('f-16c', { pilotG: 7 }) })));
    // F-16C: fly-by-wire 10 g; MiG-29: no fly-by-wire, so the instructor allows more.
    expect(within(row('G limit in use')).getByText('10.0 g')).toBeInTheDocument();
    expect(within(row('Pilot G (as flown)')).getByText('7.0 g')).toBeInTheDocument();
    expect(row('G limit in use').querySelector('[data-best]')?.textContent).toMatch(/^1[12]\.\d g/);
  });

  it('separates full-pull and as-flown figures at the merge for a smooth pilot', () => {
    renderTable(computeMatchup(testScenario({ attacker: sideConfig('f-16c', { pilotG: 6 }) })));
    const [pull] = within(row('Max turn rate (full pull)')).getAllByRole('cell');
    const [flown] = within(row('Turn rate as flown')).getAllByRole('cell');
    expect(Number.parseFloat(flown?.textContent ?? '')).toBeLessThan(
      Number.parseFloat(pull?.textContent ?? ''),
    );
  });

  it('does not highlight informational rows or mirror matchups', () => {
    renderTable(computeMatchup(testScenario({ defender: sideConfig('f-16c') })), '');
    expect(screen.queryAllByText('(advantage)')).toHaveLength(0);
  });

  it('shows dashes when the merge speed is outside the envelope', () => {
    renderTable(computeMatchup(testScenario({ mergeCas: kmhToMs(120) })), '120 km/h');
    expect(within(row('Max turn rate (full pull)')).getAllByText('—')).toHaveLength(2);
  });

  it('adds top-of-loop and bottom-of-loop turn rates only when a jet turns in an inclined plane', () => {
    const { unmount } = renderTable(computeMatchup(testScenario()));
    expect(screen.queryByRole('rowheader', { name: 'Over the top of the plane' })).toBeNull();
    unmount();

    renderTable(
      computeMatchup(testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg: 90 }) })),
    );
    const cell = (label: string) =>
      Number.parseFloat(within(row(label)).getAllByRole('cell')[0]?.textContent ?? '');
    // Gravity adds g/V over the top and takes it away at the bottom.
    expect(cell('Over the top of the plane')).toBeGreaterThan(cell('Turn rate as flown'));
    expect(cell('At the bottom of the plane')).toBeLessThan(cell('Turn rate as flown'));
  });
});
