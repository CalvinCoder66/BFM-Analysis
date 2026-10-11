import { render, screen } from '@testing-library/react';
import { App } from './app';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /bfm analysis/i })).toBeInTheDocument();
  });
});
