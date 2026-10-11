import { render, screen, within } from '@testing-library/react';
import { kmhToMs } from '../../physics/units';
import { MatchupTable } from './MatchupTable';
import { computeMatchup, type Scenario } from './matchup';

const scenario = (mergeKmh: number, defenderId = 'mig-29'): Scenario => ({
  altitude_m: 1_000,
  mergeCas: kmhToMs(mergeKmh),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: 'clean' },
  defender: { aircraftId: defenderId, fuelFraction: 0.5, loadoutId: 'clean' },
});

const row = (label: string) =>
  screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;

describe('MatchupTable', () => {
  it('lists both aircraft and highlights the better value per metric', () => {
    const m = computeMatchup(scenario(800));
    render(<MatchupTable matchup={m} unit="kmh" mergeLabel="800 km/h" />);
    expect(screen.getByRole('columnheader', { name: 'F-16C Block 50' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'MiG-29 (9-12)' })).toBeInTheDocument();
    expect(screen.getByText(/At merge · 800 km\/h/)).toBeInTheDocument();

    // Mock data: the F-16C wins on sustained rate, the MiG-29 on minimum radius.
    expect(within(row('Best STR')).getAllByText('(advantage)')).toHaveLength(1);
    expect(row('Best STR').querySelector('[data-best]')?.textContent).toContain(
      `${m.attacker.summary.maxStr.value.toFixed(1)}°/s`,
    );
    expect(row('Min radius').querySelector('[data-best]')?.textContent).toContain(
      `${Math.round(m.defender.summary.minRadius.value)} m`,
    );
  });

  it('does not highlight informational rows or mirror matchups', () => {
    render(
      <MatchupTable matchup={computeMatchup(scenario(800, 'f-16c'))} unit="kmh" mergeLabel="" />,
    );
    expect(screen.queryAllByText('(advantage)')).toHaveLength(0);
  });

  it('shows dashes when the merge speed is outside the envelope', () => {
    render(
      <MatchupTable matchup={computeMatchup(scenario(120))} unit="kmh" mergeLabel="120 km/h" />,
    );
    expect(within(row('Max turn rate (ITR)')).getAllByText('—')).toHaveLength(2);
  });
});
