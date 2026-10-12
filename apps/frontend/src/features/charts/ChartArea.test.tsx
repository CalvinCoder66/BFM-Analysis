import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sideConfig, testScenario } from '../../test/scenarios';
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
    expect(svg.querySelectorAll('polyline[data-track]')).toHaveLength(2);
    expect(screen.getByText(/F-16C Block 50: turned \d+°/)).toBeInTheDocument();
  });

  it('shows the turn circles from the top, the side, or wherever they are dragged', async () => {
    const looping = computeMatchup(
      testScenario({ attacker: sideConfig('f-16c', { turnPlane_deg: 90 }) }),
    );
    render(<ChartArea {...props} matchup={looping} charts={['circles']} />);
    const svg = screen.getByRole('img', { name: 'Turn circles, 2-circle fight' });
    const points = () => svg.querySelector('polyline[data-track=attacker]')?.getAttribute('points');
    const spread = (axis: 0 | 1) => {
      const values = (points() ?? '').split(' ').map((pair) => Number(pair.split(',')[axis]));
      return Math.max(...values) - Math.min(...values);
    };

    // From above, a vertical loop is edge-on: a straight north–south line.
    await userEvent.click(screen.getByLabelText('Top'));
    expect(spread(0)).toBeCloseTo(0, 6);
    // From the side it shows its full height.
    await userEvent.click(screen.getByLabelText('Side'));
    expect(spread(1)).toBeGreaterThan(500);

    const side = points();
    fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 130 });
    fireEvent.pointerUp(svg);
    expect(points()).not.toBe(side);
    expect(points()).not.toMatch(/NaN/);
    expect(screen.getByLabelText('Side')).not.toBeChecked();
  });

  it('zooms and moves the turn circles and can hide the box round them', async () => {
    render(<ChartArea {...props} charts={['circles']} />);
    const svg = screen.getByRole('img', { name: 'Turn circles, 2-circle fight' });
    const width = () => Number(svg.getAttribute('viewBox')?.split(' ')[2]);
    const start = width();

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // Each press zooms 1.5×, so the view shows 1 / 2.25 as much.
    expect(width()).toBeCloseTo(start / 2.25, 6);
    expect(screen.getByText('×2.3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(width()).toBeCloseTo(start, 6);

    // Right-drag moves where the camera looks: the view shifts, its size stays.
    const origin = () => svg.getAttribute('viewBox')?.split(' ').slice(0, 2).join(' ');
    const centred = origin();
    // jsdom has no layout; give the drawing a size so pixels convert to metres.
    svg.getBoundingClientRect = () => new DOMRect(0, 0, 500, 500);
    fireEvent.pointerDown(svg, { button: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { button: 2, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(svg);
    expect(origin()).not.toBe(centred);
    expect(origin()).not.toMatch(/NaN/);
    expect(width()).toBeCloseTo(start, 6);
    expect(fireEvent.contextMenu(svg)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(origin()).toBe(centred);

    expect(svg.querySelectorAll('[data-axis]')).toHaveLength(3);
    await userEvent.click(screen.getByLabelText('Box'));
    expect(svg.querySelector('[data-box]')).toBeNull();
    expect(svg.querySelectorAll('polyline[data-track]')).toHaveLength(2);
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
