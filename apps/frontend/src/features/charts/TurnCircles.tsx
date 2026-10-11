import { useMemo } from 'react';
import { formatSpeed, type SpeedUnit } from '../../shared/format';
import { type Matchup, SIDES, type Side } from '../comparison/matchup';
import {
  type FightType,
  mergeTracks,
  scaleBarLength,
  type TrackPoint,
  trackBounds,
} from './circles';
import { SIDE_COLOURS } from './series';

const TICK_EVERY_S = 5;

function EndMarker({ point, size, colour }: { point: TrackPoint; size: number; colour: string }) {
  // Arrowhead pointing along the heading (SVG y is flipped, so rotate clockwise from north).
  return (
    <path
      d={`M 0 ${-size} L ${size * 0.6} ${size * 0.7} L 0 ${size * 0.35} L ${-size * 0.6} ${size * 0.7} Z`}
      transform={`translate(${point.x} ${-point.y}) rotate(${point.heading})`}
      fill={colour}
      stroke="#0b1222"
      strokeWidth={size * 0.08}
    />
  );
}

export function TurnCircles({
  matchup,
  unit,
  fightType,
}: {
  matchup: Matchup;
  unit: SpeedUnit;
  fightType: FightType;
}) {
  const tracks = useMemo(() => mergeTracks(matchup, fightType), [matchup, fightType]);
  const bounds = trackBounds(tracks);
  const unitSize = bounds.width / 100;
  const scale = scaleBarLength(bounds.width);
  const duration = tracks.attacker.at(-1)?.t ?? 0;

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="px-2 text-xs text-slate-500">
        {fightType === 'one-circle'
          ? '1-circle: defender turns away, both pull to the limiter'
          : '2-circle: both turn towards each other, flown as set'}{' '}
        · top-down, {duration.toFixed(0)} s from the merge · dot every {TICK_EVERY_S} s
      </p>

      <svg
        role="img"
        aria-label={`Turn circles, ${fightType === 'one-circle' ? '1-circle' : '2-circle'} fight`}
        viewBox={`${bounds.minX} ${-(bounds.minY + bounds.height)} ${bounds.width} ${bounds.height}`}
        className="min-h-0 w-full flex-1 rounded bg-[#0b1222]"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Merge point */}
        <g stroke="#facc15" strokeWidth={unitSize * 0.25}>
          <line x1={-unitSize * 1.5} y1={0} x2={unitSize * 1.5} y2={0} />
          <line x1={0} y1={-unitSize * 1.5} x2={0} y2={unitSize * 1.5} />
        </g>
        <text x={unitSize * 2} y={-unitSize} fill="#facc15" fontSize={unitSize * 3}>
          Merge
        </text>

        {SIDES.map((side: Side) => {
          const points = tracks[side];
          const colour = SIDE_COLOURS[side];
          const last = points.at(-1);
          const ticks = points.filter(
            (p, i) => i > 0 && Math.abs(p.t / TICK_EVERY_S - Math.round(p.t / TICK_EVERY_S)) < 1e-6,
          );
          return (
            <g key={side} data-side={side}>
              <polyline
                points={points.map((p) => `${p.x},${-p.y}`).join(' ')}
                fill="none"
                stroke={colour}
                strokeWidth={unitSize * 0.5}
                strokeLinejoin="round"
              />
              {ticks.map((p) => (
                <g key={p.t}>
                  <circle cx={p.x} cy={-p.y} r={unitSize * 0.7} fill={colour} />
                  <text
                    x={p.x + unitSize * 1.2}
                    y={-p.y - unitSize * 1.2}
                    fill={colour}
                    fontSize={unitSize * 2.6}
                    opacity={0.85}
                  >
                    {p.t.toFixed(0)}s
                  </text>
                </g>
              ))}
              {last && <EndMarker point={last} size={unitSize * 2.2} colour={colour} />}
            </g>
          );
        })}

        {/* Scale bar */}
        <g
          transform={`translate(${bounds.minX + unitSize * 4} ${-(bounds.minY + unitSize * 4)})`}
          stroke="#94a3b8"
          strokeWidth={unitSize * 0.3}
        >
          <line x1={0} y1={0} x2={scale} y2={0} />
          <line x1={0} y1={-unitSize} x2={0} y2={unitSize} />
          <line x1={scale} y1={-unitSize} x2={scale} y2={unitSize} />
          <text
            x={scale / 2}
            y={-unitSize * 1.8}
            fill="#94a3b8"
            stroke="none"
            fontSize={unitSize * 2.8}
            textAnchor="middle"
          >
            {scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}
          </text>
        </g>
      </svg>

      <ul className="grid gap-1 px-2 text-xs sm:grid-cols-2">
        {SIDES.map((side) => {
          const last = tracks[side].at(-1);
          if (!last) return null;
          return (
            <li key={side} className="font-mono" style={{ color: SIDE_COLOURS[side] }}>
              {matchup[side].aircraft.name}: turned {Math.round(last.turned)}° · ends at{' '}
              {formatSpeed(last.cas, unit)} · pulling {last.g.toFixed(1)} g
            </li>
          );
        })}
      </ul>
    </div>
  );
}
