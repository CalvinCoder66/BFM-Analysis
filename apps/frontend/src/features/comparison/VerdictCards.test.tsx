import { render, screen, within } from '@testing-library/react';
import { kmhToMs } from '../../physics/units';
import { computeMatchup, type Scenario } from './matchup';
import { VerdictCards } from './VerdictCards';

const base: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: 'clean' },
  defender: { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: 'clean' },
};

const card = (name: string) => screen.getByRole('article', { name });

describe('VerdictCards', () => {
  it('names the winner of each fight with the margin', () => {
    const m = computeMatchup(base);
    render(<VerdictCards matchup={m} unit="kmh" />);

    const oneCircle = card('1-circle · radius fight');
    expect(within(oneCircle).getByText('MiG-29 (9-12)')).toBeInTheDocument();
    const radiusGap = Math.round(
      m.attacker.summary.minRadius.value - m.defender.summary.minRadius.value,
    );
    expect(within(oneCircle).getByText(`${radiusGap} m tighter`)).toBeInTheDocument();

    const twoCircle = card('2-circle · rate fight');
    expect(within(twoCircle).getByText('F-16C Block 50')).toBeInTheDocument();
    expect(within(twoCircle).getByText(/\+\d+\.\d°\/s sustained/)).toBeInTheDocument();
  });

  it('calls a mirror matchup even', () => {
    render(
      <VerdictCards matchup={computeMatchup({ ...base, defender: base.attacker })} unit="kmh" />,
    );
    expect(within(card('1-circle · radius fight')).getByText('Even')).toBeInTheDocument();
    expect(within(card('2-circle · rate fight')).getByText('Even')).toBeInTheDocument();
    expect(within(card('Energy at merge')).getByText('Even')).toBeInTheDocument();
  });

  it('shows speeds in the selected unit', () => {
    render(<VerdictCards matchup={computeMatchup(base)} unit="kts" />);
    expect(within(card('2-circle · rate fight')).getAllByText(/kts/).length).toBeGreaterThan(0);
  });
});
