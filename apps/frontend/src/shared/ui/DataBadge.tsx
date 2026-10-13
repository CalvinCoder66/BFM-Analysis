import type { DataStatus } from '../../data/aircraft';

const STYLE: Record<DataStatus, { label: string; title: string; className: string }> = {
  mock: {
    label: 'Mock',
    title: 'Mock data for development, not War Thunder values',
    className: 'border-amber-400/40 text-amber-300/90',
  },
  unvalidated: {
    label: 'Unvalidated',
    title: 'Extracted from the datamine but not yet checked against test flights',
    className: 'border-sky-400/40 text-sky-300/90',
  },
  validated: {
    label: 'Datamine',
    title: 'Extracted from the datamine and checked against test flights',
    className: 'border-emerald-400/40 text-emerald-300/90',
  },
};

/** Where an aircraft's data comes from: "Mock", "Unvalidated · WT 2.59" or "Datamine · WT 2.59". */
export function DataBadge({ status, patch }: { status: DataStatus; patch: string | null }) {
  const { label, title, className } = STYLE[status];
  return (
    <span
      title={title}
      className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${className}`}
    >
      {status !== 'mock' && patch ? `${label} · ${patch}` : label}
    </span>
  );
}
