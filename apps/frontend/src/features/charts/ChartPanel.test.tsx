import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kmhToMs } from '../../physics/units';
import { computeMatchup, type Scenario } from '../comparison/matchup';
import { ChartPanel } from './ChartPanel';
import type { Figure } from './series';

// Plotly needs a real browser; capture the figure instead (rendering is covered by e2e).
const rendered: { figure?: Figure; label?: string } = {};
vi.mock('./PlotlyChart', () => ({
  PlotlyChart: ({ figure, label }: { figure: Figure; label: string }) => {
    rendered.figure = figure;
    rendered.label = label;
    return <div data-testid="plot" />;
  },
}));

const scenario: Scenario = {
  altitude_m: 1_000,
  mergeCas: kmhToMs(800),
  attacker: { aircraftId: 'f-16c', fuelFraction: 0.5, loadoutId: 'clean' },
  defender: { aircraftId: 'mig-29', fuelFraction: 0.5, loadoutId: 'clean' },
};
const matchup = computeMatchup(scenario);
const traceNames = () =>
  (rendered.figure?.data ?? []).map((t) => (t as { name?: string }).name ?? '');

describe('ChartPanel', () => {
  it('shows the E-M diagram by default', () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    expect(screen.getByRole('tab', { name: 'E-M diagram' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(rendered.label).toBe('E-M diagram chart');
    expect(traceNames().some((n) => n.includes('sustained (Ps 0)'))).toBe(true);
  });

  it('switches views from the tabs', async () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    await userEvent.click(screen.getByRole('tab', { name: 'Turn radius' }));
    expect(screen.getByRole('tab', { name: 'Turn radius' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: 'Turn radius' })).toBeInTheDocument();
    expect(traceNames().some((n) => n.includes('min radius'))).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'Energy (Ps)' }));
    expect(traceNames().some((n) => n.includes('Ps at max G'))).toBe(true);
  });

  it('toggles E-M overlays and hides the toggles on other views', async () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    const contours = () => traceNames().filter((n) => n.includes(' · Ps ')).length;
    expect(contours()).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText('Ps contours'));
    expect(contours()).toBe(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Advantage' }));
    expect(screen.queryByLabelText('Ps contours')).not.toBeInTheDocument();
  });
});
