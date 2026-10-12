import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatClimb, formatDistance, formatSpeed, type SpeedUnit } from '../../shared/format';
import { Segmented } from '../../shared/ui/Segmented';
import { type Matchup, SIDES, type Side } from '../comparison/matchup';
import { anyInclined } from '../comparison/metrics';
import {
  axisTicks,
  boxFrame,
  buildScene,
  type Camera,
  type FightType,
  mergeTracks,
  orbit,
  type Point3,
  project,
  type Segment,
  VIEWS,
} from './circles';
import { SIDE_COLOURS } from './series';

const TICK_EVERY_S = 5;
const VIEW_OPTIONS = [
  { value: '3d', label: '3D' },
  { value: 'top', label: 'Top' },
  { value: 'side', label: 'Side' },
] as const;
type View = keyof typeof VIEWS | 'free';

/** Distance-scale label: "−1,000", "0", "500". */
const formatMetres = (metres: number) =>
  `${metres < 0 ? '−' : ''}${Math.abs(Math.round(metres)).toLocaleString('en-GB')}`;

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
  const scene = useMemo(() => buildScene(tracks), [tracks]);
  const [view, setView] = useState<View>('3d');
  const [camera, setCamera] = useState<Camera>(VIEWS['3d']);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const inclined = anyInclined(matchup);
  const duration = tracks.attacker.at(-1)?.t ?? 0;
  // SVG y runs down; the projection's runs up.
  const screen = (p: Point3) => {
    const q = project(p, camera);
    return [q.x, -q.y] as const;
  };
  const toPoints = (points: Point3[]) => points.map((p) => screen(p).join(',')).join(' ');
  const { box } = scene;
  const ground = (p: Point3) => ({ ...p, z: box.minZ });
  const [cx, cy] = screen(scene.centre);
  // Room round the box for the distance labels.
  const size = scene.radius * 2.4;
  const u = size / 100;
  const frame = boxFrame(box, camera);
  const axes = axisTicks(box, camera);
  // Segments are a fixed list for a given box, so their index is a stable key.
  const segment = ([a, b]: Segment, i: number) => {
    const [x1, y1] = screen(a);
    const [x2, y2] = screen(b);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  };
  const [mx, my] = screen({ x: 0, y: 0, z: 0 });

  const choose = (next: View) => {
    setView(next);
    if (next !== 'free') setCamera(VIEWS[next]);
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const last = drag.current;
    if (!last) return;
    setCamera((c) => orbit(c, e.clientX - last.x, e.clientY - last.y));
    setView('free');
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={container}
      className={`flex h-full flex-col gap-2 ${fullscreen ? 'bg-slate-950 p-4' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
        <p className="mr-auto text-xs text-slate-500">
          {fightType === 'one-circle'
            ? '1-circle: defender turns away, both pull to the limiter'
            : '2-circle: both turn towards each other, flown as set'}{' '}
          · {duration.toFixed(0)} s from the merge · dot every {TICK_EVERY_S} s · grid{' '}
          {formatDistance(box.spacing)} · heights from the merge · drag to look around
        </p>
        <Segmented legend="View" value={view} options={VIEW_OPTIONS} onChange={choose} />
        {document.fullscreenEnabled && (
          <button
            type="button"
            onClick={() =>
              (fullscreen
                ? document.exitFullscreen()
                : container.current?.requestFullscreen()
              )?.catch(() => {})
            }
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>

      <svg
        role="img"
        aria-label={`Turn circles, ${fightType === 'one-circle' ? '1-circle' : '2-circle'} fight`}
        viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`}
        className="min-h-0 w-full flex-1 cursor-grab touch-none select-none rounded bg-[#0b1222] active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Box round the fight: gridded floor and back walls, edges, and distance scales */}
        <g stroke="#1e293b" strokeWidth={u * 0.2}>
          {frame.grid.map(segment)}
        </g>
        <g stroke="#334155" strokeWidth={u * 0.25}>
          {frame.edges.map(segment)}
        </g>
        {axes.map(({ axis, title, ticks, middle, out }) => {
          // Screen y runs down, so flip the outward direction's y.
          const anchor = out.x > 0.3 ? 'start' : out.x < -0.3 ? 'end' : 'middle';
          const [tx, ty] = screen(middle);
          return (
            <g key={axis} data-axis={axis} fill="#64748b" fontSize={u * 2.2}>
              {ticks.map(({ at, value }) => {
                const [x, y] = screen(at);
                return (
                  <text
                    key={value}
                    x={x + out.x * u * 2}
                    y={y - out.y * u * 2}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                  >
                    {formatMetres(value)}
                  </text>
                );
              })}
              <text
                x={tx + out.x * u * 8}
                y={ty - out.y * u * 8}
                textAnchor={anchor}
                dominantBaseline="middle"
                fill="#94a3b8"
              >
                {title}
              </text>
            </g>
          );
        })}

        {/* Merge point, drawn flat on the screen so it reads from any angle */}
        <g stroke="#facc15" strokeWidth={u * 0.25}>
          <line x1={mx - u * 1.5} y1={my} x2={mx + u * 1.5} y2={my} />
          <line x1={mx} y1={my - u * 1.5} x2={mx} y2={my + u * 1.5} />
        </g>
        <text x={mx + u * 2} y={my - u} fill="#facc15" fontSize={u * 3}>
          Merge
        </text>

        {SIDES.map((side: Side) => {
          const points = tracks[side];
          const colour = SIDE_COLOURS[side];
          const ticks = points.filter(
            (p, i) => i > 0 && Math.abs(p.t / TICK_EVERY_S - Math.round(p.t / TICK_EVERY_S)) < 1e-6,
          );
          const climbs = points.some((p) => Math.abs(p.z) > 1);
          return (
            <g key={side} data-side={side}>
              {climbs && (
                <>
                  {/* Shadow on the ground and drop lines show height from any angle */}
                  <polyline
                    points={toPoints(points.map(ground))}
                    fill="none"
                    stroke={colour}
                    strokeOpacity={0.25}
                    strokeWidth={u * 0.3}
                  />
                  {ticks.map((p) => {
                    const [x1, y1] = screen(p);
                    const [x2, y2] = screen(ground(p));
                    return (
                      <line
                        key={p.t}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={colour}
                        strokeOpacity={0.4}
                        strokeWidth={u * 0.2}
                        strokeDasharray={`${u} ${u}`}
                      />
                    );
                  })}
                </>
              )}
              <polyline
                data-track={side}
                points={toPoints(points)}
                fill="none"
                stroke={colour}
                strokeWidth={u * 0.5}
                strokeLinejoin="round"
              />
              {ticks.map((p) => {
                const [x, y] = screen(p);
                return (
                  <g key={p.t}>
                    <circle cx={x} cy={y} r={u * 0.7} fill={colour}>
                      <title>
                        {`${matchup[side].aircraft.name}, ${p.t.toFixed(0)} s: ${formatSpeed(p.cas, unit)}, ${formatClimb(p.z)}, ${p.g.toFixed(1)} g`}
                      </title>
                    </circle>
                    <text
                      x={x + u * 1.2}
                      y={y - u * 1.2}
                      fill={colour}
                      fontSize={u * 2.6}
                      opacity={0.85}
                    >
                      {p.t.toFixed(0)}s
                    </text>
                  </g>
                );
              })}
              <EndMarker points={points.slice(-2).map(screen)} size={u * 2.2} colour={colour} />
            </g>
          );
        })}
      </svg>

      <ul className="grid gap-1 px-2 text-xs sm:grid-cols-2">
        {SIDES.map((side) => {
          const last = tracks[side].at(-1);
          if (!last) return null;
          return (
            <li key={side} className="font-mono" style={{ color: SIDE_COLOURS[side] }}>
              {matchup[side].aircraft.name}: turned {Math.round(last.turned)}° · ends at{' '}
              {formatSpeed(last.cas, unit)}
              {inclined && ` · ${formatClimb(last.z)}`} · pulling {last.g.toFixed(1)} g
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Arrowhead at the end of a track, pointing along its last on-screen segment. */
function EndMarker({
  points,
  size,
  colour,
}: {
  points: (readonly [number, number])[];
  size: number;
  colour: string;
}) {
  const [from, to] = points;
  if (!from || !to) return null;
  const angle = (Math.atan2(to[0] - from[0], from[1] - to[1]) * 180) / Math.PI;
  return (
    <path
      d={`M 0 ${-size} L ${size * 0.6} ${size * 0.7} L 0 ${size * 0.35} L ${-size * 0.6} ${size * 0.7} Z`}
      transform={`translate(${to[0]} ${to[1]}) rotate(${angle})`}
      fill={colour}
      stroke="#0b1222"
      strokeWidth={size * 0.08}
    />
  );
}
