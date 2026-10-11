import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sideConfig, testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import { fightResults } from './focus';
import { Hotbar } from './Hotbar';

const scenario = testScenario({ attacker: sideConfig('f-16c', { pilotG: 7 }) });
const matchup = computeMatchup(scenario);
const results = fightResults(matchup, scenario, 'kmh');
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('Hotbar', () => {
  it('shows each fight with its winner and why', () => {
    render(<Hotbar matchup={matchup} results={results} active="summary" onSelect={() => {}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(within(tab(/^1-circle/)).getByText('MiG-29 (9-12)')).toBeInTheDocument();
    expect(tab(/^1-circle/)).toHaveTextContent(/\d+ m tighter/);
    expect(within(tab(/^2-circle/)).getByText('F-16C Block 50')).toBeInTheDocument();
    expect(tab(/^2-circle/)).toHaveTextContent(/\+\d+\.\d°\/s sustained/);
    // The smooth F-16C keeps far more speed than the yanking MiG-29.
    expect(within(tab(/^Energy/)).getByText('F-16C Block 50')).toBeInTheDocument();
    expect(tab(/^Energy/)).toHaveTextContent(/km\/h after 20 s/);
  });

  it('summarises every fight in the summary slot', () => {
    render(<Hotbar matchup={matchup} results={results} active="summary" onSelect={() => {}} />);
    expect(tab(/^Summary/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^Summary/)).toHaveTextContent(
      '1-circle MiG-29 (9-12) · 2-circle F-16C Block 50 · Energy F-16C Block 50',
    );
  });

  it('selects a focus view', async () => {
    const onSelect = vi.fn();
    render(<Hotbar matchup={matchup} results={results} active="summary" onSelect={onSelect} />);
    await userEvent.click(tab(/^2-circle/));
    expect(onSelect).toHaveBeenCalledWith('two-circle');
  });

  it('calls a mirror matchup even', () => {
    const mirror = computeMatchup(testScenario({ defender: sideConfig('f-16c') }));
    render(
      <Hotbar
        matchup={mirror}
        results={fightResults(mirror, testScenario(), 'kmh')}
        active="summary"
        onSelect={() => {}}
      />,
    );
    for (const name of [/^1-circle/, /^2-circle/, /^Energy/]) {
      expect(within(tab(name)).getByText('Even')).toBeInTheDocument();
    }
  });
});
