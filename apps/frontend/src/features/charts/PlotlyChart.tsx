import Plotly from 'plotly.js-basic-dist-min';
import { useEffect, useRef } from 'react';
import type { Figure } from './series';

const CONFIG: Partial<Plotly.Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
};

/** Thin wrapper over Plotly.react; the figure is rebuilt by the parent when inputs change. */
export function PlotlyChart({ figure, label }: { figure: Figure; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) void Plotly.react(ref.current, figure.data, figure.layout, CONFIG);
  }, [figure]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} role="img" aria-label={label} className="h-full w-full" />;
}
