import { type AxisTicks, axisTicks, type Box, boxFrame, type Segment } from './box';
import type { Camera, Point3 } from './camera';

/**
 * How the box looks. Line widths and font sizes are in view units (a hundredth of the visible
 * width), so they stay the same size on screen at any zoom.
 */
export interface LineStyle {
  colour: string;
  width: number;
  opacity: number;
}

export interface BoxStyle {
  /** Floor and back-wall grid. */
  grid: LineStyle;
  /** Faint lines through the inside, marking out grid-step cubes. */
  lattice: LineStyle;
  edges: LineStyle;
  /** Distance-scale numbers and axis titles. */
  labels: { colour: string; titleColour: string; size: number };
}

export const BOX_STYLE: BoxStyle = {
  grid: { colour: '#1e293b', width: 0.2, opacity: 1 },
  lattice: { colour: '#1e293b', width: 0.12, opacity: 0.55 },
  edges: { colour: '#334155', width: 0.25, opacity: 1 },
  labels: { colour: '#64748b', titleColour: '#94a3b8', size: 2.2 },
};

/** Distance-scale label: "−1,000", "0", "500". */
const formatMetres = (metres: number) =>
  `${metres < 0 ? '−' : ''}${Math.abs(Math.round(metres)).toLocaleString('en-GB')}`;

/** The box round the 3D turn circles, drawn behind the tracks. */
export function SceneBox({
  box,
  camera,
  toScreen,
  unit,
  style = BOX_STYLE,
}: {
  box: Box;
  camera: Camera;
  /** Projects a scene point to SVG coordinates. */
  toScreen: (p: Point3) => readonly [number, number];
  /** One view unit, in SVG coordinates. */
  unit: number;
  style?: BoxStyle;
}) {
  const frame = boxFrame(box, camera);
  // Segments are a fixed list for a given box and camera, so their index is a stable key.
  const lines = (segments: Segment[], { colour, width, opacity }: LineStyle) => (
    <g stroke={colour} strokeWidth={unit * width} strokeOpacity={opacity}>
      {segments.map(([a, b], i) => {
        const [x1, y1] = toScreen(a);
        const [x2, y2] = toScreen(b);
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed list, see above
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </g>
  );
  return (
    <g data-box="">
      {lines(frame.lattice, style.lattice)}
      {lines(frame.grid, style.grid)}
      {lines(frame.edges, style.edges)}
      {axisTicks(box, camera).map((axis) => (
        <Scale key={axis.axis} axis={axis} toScreen={toScreen} unit={unit} style={style.labels} />
      ))}
    </g>
  );
}

/** One distance scale: numbers along a box edge and the axis title beyond them. */
function Scale({
  axis: { axis, title, ticks, middle, out },
  toScreen,
  unit,
  style,
}: {
  axis: AxisTicks;
  toScreen: (p: Point3) => readonly [number, number];
  unit: number;
  style: BoxStyle['labels'];
}) {
  const anchor = out.x > 0.3 ? 'start' : out.x < -0.3 ? 'end' : 'middle';
  // `out` points up the screen for positive y; SVG y runs down.
  const label = (p: Point3, distance: number) => {
    const [x, y] = toScreen(p);
    return { x: x + out.x * unit * distance, y: y - out.y * unit * distance };
  };
  return (
    <g data-axis={axis} fill={style.colour} fontSize={unit * style.size}>
      {ticks.map(({ at, value }) => (
        <text key={value} {...label(at, 2)} textAnchor={anchor} dominantBaseline="middle">
          {formatMetres(value)}
        </text>
      ))}
      <text
        {...label(middle, 8)}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={style.titleColour}
      >
        {title}
      </text>
    </g>
  );
}
