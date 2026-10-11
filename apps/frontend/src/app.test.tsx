import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';

vi.mock('./features/charts/PlotlyChart', () => ({
  PlotlyChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

const mergeCell = (label: string, column: number) =>
  within(screen.getByRole('row', { name: new RegExp(`^${label}`) })).getAllByRole('cell')[column]
    ?.textContent;

describe('App', () => {
  it('renders the dashboard with the default F-16C vs MiG-29 matchup', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /bfm analysis/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Attacker aircraft')).toHaveValue('f-16c');
    expect(screen.getByLabelText('Defender aircraft')).toHaveValue('mig-29');
    expect(screen.getByRole('img', { name: 'E-M diagram chart' })).toBeInTheDocument();
  });

  it('recomputes the comparison when the scenario changes', async () => {
    render(<App />);
    const before = mergeCell('Sustained turn rate', 0);

    fireEvent.change(screen.getByLabelText('Altitude'), { target: { value: '9000' } });
    const after = mergeCell('Sustained turn rate', 0);
    expect(after).not.toBe(before);
    expect(Number.parseFloat(after ?? '')).toBeLessThan(Number.parseFloat(before ?? ''));

    await userEvent.selectOptions(screen.getByLabelText('Defender aircraft'), 'su-27');
    expect(screen.getByRole('columnheader', { name: 'Su-27S' })).toBeInTheDocument();
  });

  it('applies the speed unit across the dashboard', async () => {
    render(<App />);
    await userEvent.click(screen.getByLabelText('kts'));
    expect(screen.getByText(/At merge · 432 kts/)).toBeInTheDocument();
  });
});
