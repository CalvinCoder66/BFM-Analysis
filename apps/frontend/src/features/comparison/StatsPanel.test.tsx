import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kmhToMs } from '../../physics/units';
import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup, type Matchup } from './matchup';
import { METRICS as M, type MetricSection } from './metrics';
import { StatsPanel } from './StatsPanel';

const row = (label: string) =>
  screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;
const cellNumber = (label: string, column: number) =>
  Number.parseFloat(within(row(label)).getAllByRole('cell')[column]?.textContent ?? '');

const key: MetricSection[] = [{ title: 'Key', metrics: [M.bestStr, M.minRadius, M.mass] }];
const more: MetricSection[] = [{ title: 'More', metrics: [M.gLimit, M.pilotG] }];
const renderPanel = (m: Matchup, sections = key, moreSections = more) =>
  render(<StatsPanel matchup={m} unit="kmh" sections={sections} moreSections={moreSections} />);

describe('StatsPanel', () => {
  it('lists both aircraft and highlights the better value per metric', () => {
    const m = computeMatchup(testScenario());
    renderPanel(m);
    expect(screen.getByRole('columnheader', { name: 'F-16C Block 50' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'MiG-29 (9-12)' })).toBeInTheDocument();

    // Mock data: the F-16C wins on sustained rate, the MiG-29 on minimum radius.
    expect(row('Best STR').querySelector('[data-best]')?.textContent).toContain(
      `${m.attacker.flown.summary.maxStr.value.toFixed(1)}°/s`,
    );
    expect(row('Min radius').querySelector('[data-best]')?.textContent).toContain(
      `${Math.round(m.defender.pull.summary.minRadius.value)} m`,
    );
    // Informational rows never get a winner.
    expect(within(row('Mass')).queryByText('(advantage)')).toBeNull();
  });

  it('keeps the extra stats hidden until asked for', async () => {
    renderPanel(computeMatchup(testScenario({ attacker: sideConfig('f-16c', { pilotG: 7 }) })));
    expect(screen.queryByRole('rowheader', { name: 'Pilot G (as flown)' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Show more stats' }));
    expect(within(row('Pilot G (as flown)')).getByText('7.0 g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide more stats' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('shows top- and bottom-of-plane rates only when a jet turns in an inclined plane', () => {
    const sections = [
      { title: 'Plane', metrics: [M.flownRateAtMerge, M.topOfPlane, M.bottomOfPlane] },
    ];
    const { unmount } = renderPanel(computeMatchup(testScenario()), sections, []);
    expect(screen.queryByRole('rowheader', { name: 'Over the top of the plane' })).toBeNull();
    unmount();

    renderPanel(
      computeMatchup(testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg: 90 }) })),
      sections,
      [],
    );
    // Gravity adds g/V over the top and takes it away at the bottom.
    expect(cellNumber('Over the top of the plane', 0)).toBeGreaterThan(
      cellNumber('Turn rate at merge', 0),
    );
    expect(cellNumber('At the bottom of the plane', 0)).toBeLessThan(
      cellNumber('Turn rate at merge', 0),
    );
  });

  it('does not highlight anything in a mirror matchup', () => {
    renderPanel(computeMatchup(testScenario({ defender: sideConfig('f-16c') })));
    expect(screen.queryAllByText('(advantage)')).toHaveLength(0);
  });

  it('shows dashes when the merge speed is outside the envelope', () => {
    renderPanel(
      computeMatchup(testScenario({ mergeCas: kmhToMs(120) })),
      [{ title: 'Merge', metrics: [M.itrAtMerge] }],
      [],
    );
    expect(within(row('Max turn rate at merge')).getAllByText('—')).toHaveLength(2);
  });
});
