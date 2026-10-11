import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './Slider';

describe('Slider', () => {
  it('is labelled, shows its display text and reports numeric changes', () => {
    const onChange = vi.fn();
    render(
      <Slider
        label="Altitude"
        value={1000}
        min={0}
        max={12000}
        step={250}
        display="1,000 m"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Altitude');
    expect(input).toHaveValue('1000');
    expect(screen.getByText('1,000 m')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '4500' } });
    expect(onChange).toHaveBeenCalledWith(4500);
  });
});
