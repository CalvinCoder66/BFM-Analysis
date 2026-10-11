import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';

vi.mock('./features/charts/PlotlyChart', () => ({
  PlotlyChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

const statNumber = (label: string, column = 0) =>
  Number.parseFloat(
    within(
      screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement,
    ).getAllByRole('cell')[column]?.textContent ?? '',
  );
const focusTab = (name: RegExp) => screen.getByRole('tab', { name });

describe('App', () => {
  it('opens on the summary: who wins each fight, with the E-M diagram', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /bfm analysis/i })).toBeInTheDocument();
    expect(focusTab(/^Summary/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: 'E-M diagram chart' })).toBeInTheDocument();
    const stats = screen.getByRole('complementary', { name: 'Summary stats' });
    expect(within(stats).getAllByRole('button', { name: 'Details ›' })).toHaveLength(3);
    // The full table stays hidden until asked for.
    expect(screen.queryByRole('rowheader', { name: 'Wing loading' })).toBeNull();
  });

  it('drills down into each fight from the hotbar or the summary', async () => {
    render(<App />);
    await userEvent.click(focusTab(/^1-circle/));
    expect(screen.getByRole('img', { name: 'Turn circles, 1-circle fight' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Min radius' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Best STR' })).toBeNull();

    await userEvent.click(focusTab(/^Summary/));
    const [, twoCircleDetails] = screen.getAllByRole('button', { name: 'Details ›' });
    await userEvent.click(twoCircleDetails as HTMLElement);
    expect(focusTab(/^2-circle/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: 'Turn circles, 2-circle fight' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Best STR' })).toBeInTheDocument();
  });

  it('recomputes the comparison when the scenario changes', async () => {
    render(<App />);
    await userEvent.click(focusTab(/^2-circle/));
    const before = statNumber('Best STR');

    fireEvent.change(screen.getByLabelText('Altitude'), { target: { value: '9000' } });
    expect(statNumber('Best STR')).toBeLessThan(before);

    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'su-27');
    expect(screen.getByRole('columnheader', { name: 'Su-27S' })).toBeInTheDocument();
  });

  it('summarises each side’s pilot and limits while the controls are collapsed', () => {
    render(<App />);
    expect(screen.getByText(/Instructor 10\.0 g · smooth 7\.0 g · 0° plane/)).toBeInTheDocument();
    expect(screen.getByText(/Instructor 11\.\d g · yanks · 0° plane/)).toBeInTheDocument();
    expect(screen.getByLabelText('Attacker pilot G')).not.toBeVisible();
  });

  it('applies the speed unit across the dashboard', async () => {
    render(<App />);
    await userEvent.click(screen.getByLabelText('kts'));
    expect(screen.getByText(/432 kts merge/)).toBeInTheDocument();
    expect(focusTab(/^Energy/)).toHaveTextContent(/kts after 20 s/);
  });
});
