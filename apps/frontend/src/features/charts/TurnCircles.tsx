import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatClimb, formatDistance, formatSpeed, type SpeedUnit } from '../../shared/format';
import { Segmented } from '../../shared/ui/Segmented';
import { type Matchup, SIDES, type Side } from '../comparison/matchup';
import { anyInclined } from '../comparison/metrics';
import {
  type Camera,
  DEFAULT_FRAMING,
  type Framing,
  orbit,
  type Point3,
  project,
  VIEWS,
  ZOOM_LIMITS,
  zoomAt,
} from './camera';
import { buildScene, type FightType, mergeTracks } from './circles';
import { SceneBox } from './SceneBox';
import { SIDE_COLOURS } from './series';

const TICK_EVERY_S = 5;
const VIEW_OPTIONS = [
  { value: '3d', label: '3D' },
  { value: 'top', label: 'Top' },
  { value: 'side', label: 'Side' },
] as const;
type View = keyof typeof VIEWS | 'free';
/** Zoom per button press, and per pixel of mouse-wheel scroll. */
const ZOOM_STEP = 1.5;
const ZOOM_PER_WHEEL_PIXEL = 0.002;
const BUTTON =
  'rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40';

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
  const [framing, setFraming] = useState<Framing>(DEFAULT_FRAMING);
  const [showBox, setShowBox] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  // The wheel listener is attached once, so it reads the latest camera from here.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  // Wheel zoom about the cursor. React's onWheel is passive, so it cannot stop the page scrolling.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      const metresPerPixel = element.viewBox.baseVal.width / Math.min(rect.width, rect.height);
      const offset = {
        x: (e.clientX - rect.left - rect.width / 2) * metresPerPixel,
        y: -(e.clientY - rect.top - rect.height / 2) * metresPerPixel,
      };
      const factor = Math.exp(-e.deltaY * ZOOM_PER_WHEEL_PIXEL);
      setFraming((f) => zoomAt(f, cameraRef.current, factor, offset));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const inclined = anyInclined(matchup);
  const duration = tracks.attacker.at(-1)?.t ?? 0;
  // SVG y runs down; the projection's runs up.
  const screen = (p: Point3) => {
    const q = project(p, camera);
    return [q.x, -q.y] as const;
  };
  const toPoints = (points: Point3[]) => points.map((p) => screen(p).join(',')).join(' ');
  const { box, centre } = scene;
  const ground = (p: Point3) => ({ ...p, z: box.minZ });
  const { pan, zoom } = framing;
  const [cx, cy] = screen({ x: centre.x + pan.x, y: centre.y + pan.y, z: centre.z + pan.z });
  // Room round the box for the distance labels; zooming in shows less of it.
  const size = (scene.radius * 2.4) / zoom;
  // One view unit: line widths and text scale with it, so they keep their size on screen.
  const u = size / 100;
  const [mx, my] = screen({ x: 0, y: 0, z: 0 });
  const zoomBy = (factor: number) => setFraming((f) => zoomAt(f, camera, factor));

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
          {formatDistance(box.spacing)} · heights from the merge · drag to look around, scroll to
          zoom
        </p>
        <Segmented legend="View" value={view} options={VIEW_OPTIONS} onChange={choose} />
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Zoom</legend>
          <button
            type="button"
            aria-label="Zoom out"
            className={BUTTON}
            disabled={zoom <= ZOOM_LIMITS.min}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className={BUTTON}
            disabled={zoom >= ZOOM_LIMITS.max}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            +
          </button>
          <span className="w-10 text-center font-mono text-xs text-slate-500">
            ×{zoom.toFixed(1)}
          </span>
          <button
            type="button"
            className={BUTTON}
            disabled={framing === DEFAULT_FRAMING}
            onClick={() => setFraming(DEFAULT_FRAMING)}
          >
            Reset zoom
          </button>
        </fieldset>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={showBox}
            onChange={(e) => setShowBox(e.target.checked)}
            className="accent-slate-400"
          />
          Box
        </label>
        {document.fullscreenEnabled && (
          <button
            type="button"
            onClick={() =>
              (fullscreen
                ? document.exitFullscreen()
                : container.current?.requestFullscreen()
              )?.catch(() => {})
            }
            className={BUTTON}
          >
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>

      <svg
        ref={svg}
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
        {showBox && <SceneBox box={box} camera={camera} toScreen={screen} unit={u} />}

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
