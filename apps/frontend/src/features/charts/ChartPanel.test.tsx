import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
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

const scenario = testScenario();
const matchup = computeMatchup(scenario);
const traceNames = () =>
  (rendered.figure?.data ?? []).map((t) => (t as { name?: string }).name ?? '');

describe('ChartPanel', () => {
  it('opens on the turn circles, drawn as SVG with one track per jet', () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    expect(screen.getByRole('tab', { name: 'Turn circles' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const svg = screen.getByRole('img', { name: 'Turn circles, 2-circle fight' });
    expect(svg.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByText(/F-16C Block 50: turned \d+°/)).toBeInTheDocument();
  });

  it('switches the turn circles between 2-circle and 1-circle geometry', async () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    await userEvent.click(screen.getByLabelText('1-circle · full pull'));
    expect(screen.getByRole('img', { name: 'Turn circles, 1-circle fight' })).toBeInTheDocument();
  });

  it('switches to Plotly views from the tabs', async () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    await userEvent.click(screen.getByRole('tab', { name: 'E-M diagram' }));
    expect(rendered.label).toBe('E-M diagram chart');
    expect(traceNames().some((n) => n.includes('sustained (Ps 0)'))).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'Turn timeline' }));
    expect(screen.getByRole('tabpanel', { name: 'Turn timeline' })).toBeInTheDocument();
    expect(traceNames().some((n) => n.includes('heading turned'))).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'Turn radius' }));
    expect(traceNames().some((n) => n.includes('min radius'))).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'Energy (Ps)' }));
    expect(traceNames().some((n) => n.includes('Ps at max G'))).toBe(true);
  });

  it('toggles E-M overlays and hides the toggles on other views', async () => {
    render(<ChartPanel matchup={matchup} scenario={scenario} unit="kmh" />);
    await userEvent.click(screen.getByRole('tab', { name: 'E-M diagram' }));
    const contours = () => traceNames().filter((n) => n.includes(' · Ps ')).length;
    expect(contours()).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText('Ps contours'));
    expect(contours()).toBe(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Advantage' }));
    expect(screen.queryByLabelText('Ps contours')).not.toBeInTheDocument();
  });
});
