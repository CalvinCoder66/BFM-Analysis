import { render, screen, within } from '@testing-library/react';
import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup, type Matchup } from './matchup';
import { VerdictCards } from './VerdictCards';

const card = (name: string) => screen.getByRole('article', { name });
const renderCards = (m: Matchup, unit: 'kmh' | 'kts' = 'kmh') =>
  render(<VerdictCards matchup={m} unit={unit} turnDuration_s={20} />);

describe('VerdictCards', () => {
  it('names the winner of each fight with the margin', () => {
    const m = computeMatchup(testScenario());
    renderCards(m);

    const oneCircle = card('1-circle · radius fight');
    expect(within(oneCircle).getByText('MiG-29 (9-12)')).toBeInTheDocument();
    const radiusGap = Math.round(
      m.attacker.pull.summary.minRadius.value - m.defender.pull.summary.minRadius.value,
    );
    expect(within(oneCircle).getByText(`${radiusGap} m tighter`)).toBeInTheDocument();

    const twoCircle = card('2-circle · rate fight');
    expect(within(twoCircle).getByText('F-16C Block 50')).toBeInTheDocument();
    expect(within(twoCircle).getByText(/\+\d+\.\d°\/s sustained/)).toBeInTheDocument();

    expect(
      within(card('Turn from merge · 20 s')).getByText(/\d+° further round/),
    ).toBeInTheDocument();
  });

  it('shows the cost of smooth flying in the turn from the merge', () => {
    // Holding 6 g, the F-16C falls behind a yanking F-16C on heading but keeps more speed.
    renderCards(
      computeMatchup(
        testScenario({
          attacker: sideConfig('f-16c', { pilotG: 6 }),
          defender: sideConfig('f-16c'),
        }),
      ),
    );
    const turn = card('Turn from merge · 20 s');
    expect(within(turn).getAllByText('F-16C Block 50')[0]).toHaveStyle({ color: '#f87171' });
    expect(within(card('Energy at merge')).getAllByText('F-16C Block 50')[0]).toHaveStyle({
      color: '#38bdf8',
    });
  });

  it('calls a mirror matchup even', () => {
    renderCards(computeMatchup(testScenario({ defender: sideConfig('f-16c') })));
    for (const name of [
      '1-circle · radius fight',
      '2-circle · rate fight',
      'Turn from merge · 20 s',
      'Energy at merge',
    ]) {
      expect(within(card(name)).getByText('Even')).toBeInTheDocument();
    }
  });

  it('shows speeds in the selected unit', () => {
    renderCards(computeMatchup(testScenario()), 'kts');
    expect(within(card('2-circle · rate fight')).getAllByText(/kts/).length).toBeGreaterThan(0);
  });
});
