import { render } from '@testing-library/react';
import Plotly from 'plotly.js-basic-dist-min';
import { PlotlyChart } from './PlotlyChart';
import type { Figure } from './series';

vi.mock('plotly.js-basic-dist-min', () => ({
  default: { react: vi.fn(() => Promise.resolve()), purge: vi.fn() },
}));

const figure: Figure = {
  data: [{ type: 'scatter', x: [1], y: [2] }],
  layout: { title: { text: 'x' } },
};

describe('PlotlyChart', () => {
  it('renders the figure into its container and redraws when the figure changes', () => {
    const { getByRole, rerender } = render(<PlotlyChart figure={figure} label="Test chart" />);
    const el = getByRole('img', { name: 'Test chart' });
    expect(Plotly.react).toHaveBeenCalledWith(el, figure.data, figure.layout, expect.any(Object));

    const next: Figure = { ...figure, data: [] };
    rerender(<PlotlyChart figure={next} label="Test chart" />);
    expect(Plotly.react).toHaveBeenLastCalledWith(el, [], figure.layout, expect.any(Object));
  });

  it('purges the plot on unmount', () => {
    const { getByRole, unmount } = render(<PlotlyChart figure={figure} label="Test chart" />);
    const el = getByRole('img', { name: 'Test chart' });
    unmount();
    expect(Plotly.purge).toHaveBeenCalledWith(el);
  });
});
