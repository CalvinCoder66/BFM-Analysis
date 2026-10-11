import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testScenario } from '../../test/scenarios';
import { computeMatchup } from '../comparison/matchup';
import { ChartArea } from './ChartArea';
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
const props = { matchup, scenario, unit: 'kmh' as const };

describe('ChartArea', () => {
  it('draws turn circles as SVG for the given fight type', () => {
    render(<ChartArea {...props} charts={['circles', 'radius']} fightType="one-circle" />);
    const svg = screen.getByRole('img', { name: 'Turn circles, 1-circle fight' });
    expect(svg.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByText(/F-16C Block 50: turned \d+°/)).toBeInTheDocument();
  });

  it('offers only the charts it is given and switches between them', async () => {
    render(<ChartArea {...props} charts={['circles', 'timeline', 'advantage']} />);
    const picker = screen.getByRole('group', { name: 'Chart' });
    expect(picker).toHaveTextContent('Turn circles');
    expect(picker).not.toHaveTextContent('E-M diagram');

    await userEvent.click(screen.getByLabelText('Turn timeline'));
    expect(rendered.label).toBe('Turn timeline chart');
    expect(traceNames().some((n) => n.includes('heading turned'))).toBe(true);
  });

  it('hides the picker when there is only one chart', () => {
    render(<ChartArea {...props} charts={['energy']} />);
    expect(screen.queryByRole('group', { name: 'Chart' })).not.toBeInTheDocument();
    expect(traceNames().some((n) => n.includes('Ps at max G'))).toBe(true);
  });

  it('shows E-M overlay toggles only on the E-M diagram', async () => {
    render(<ChartArea {...props} charts={['em', 'advantage']} />);
    const contours = () => traceNames().filter((n) => n.includes(' · Ps ')).length;
    expect(contours()).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('Ps contours'));
    expect(contours()).toBe(0);

    await userEvent.click(screen.getByLabelText('Rate advantage'));
    expect(screen.queryByLabelText('Ps contours')).not.toBeInTheDocument();
  });

  it('keeps how-to-read help collapsed until asked for', async () => {
    render(<ChartArea {...props} charts={['em']} />);
    const help = screen.getByText(/Standard energy-manoeuvrability/);
    expect(help).not.toBeVisible();
    await userEvent.click(screen.getByText('ⓘ How to read'));
    expect(help).toBeVisible();
  });
});
