import { useRef, useState, type ComponentRef } from 'react';
import { Image, PanResponder, Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { Maximize, Minus, Plus } from 'lucide-react-native';
import { resolveMedia, useTheme } from '@servebell/design-system';
import type { FloorPlanObjectView, FloorPlanTableView } from '@servebell/shared';
import { hitTest, OBJECT_STYLE, seatOffsets, statusColor, type PlanGeometry } from './model';
import { LANDMARK_ICON } from './landmarks';

export interface FloorPlan2DProps {
  plan: PlanGeometry;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Edit mode: press and drag any table or landmark; it snaps to 5 cm and stays inside the room. */
  editable?: boolean;
  /** Called once when a drag ends, with the new top-left in cm. */
  onMove?: (id: string, x: number, y: number) => void;
  /** Fixed height. Without it the plan keeps its proportions (or fills the parent with `fill`). */
  height?: number;
  fill?: boolean;
  /** Pinch to zoom, drag empty space to pan, plus +/−/fit buttons. */
  zoomable?: boolean;
  rounded?: boolean;
  /** Editor-only tracing aid drawn under the plan. */
  referenceUrl?: string | null;
  referenceOpacity?: number;
}

const SNAP = 5;
const TAP_SLOP = 6;
const MAX_ZOOM = 5;

type Element = (FloorPlanTableView | FloorPlanObjectView) & { id: string };
type Gesture =
  | { mode: 'drag' | 'tap'; hit: Element | null; moved: boolean }
  | { mode: 'pan'; moved: boolean; pan: { x: number; y: number } }
  | { mode: 'pinch'; moved: true; dist: number; zoom: number; pan: { x: number; y: number }; mid: { x: number; y: number } };

const touchInfo = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  if (!a || !b) return null;
  return { dist: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), mid: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 } };
};

/**
 * Top-down blueprint. Coordinates are the stored centimetres, scaled to the view.
 * The touch surface is the only touch target (pointerEvents="box-only"), so touch positions are
 * always relative to it, and the pan responder is created once and reads the latest props through
 * a ref — re-renders never interrupt a drag or a pinch.
 */
export function FloorPlan2D(props: FloorPlan2DProps) {
  const { plan, selectedId, height, fill, zoomable, rounded = true, referenceUrl, referenceOpacity = 0.35 } = props;
  const t = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const surface = useRef<ComponentRef<typeof View>>(null);
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const w = box.w;
  const h = fill ? box.h : (height ?? (w ? (plan.depthCm * w) / plan.widthCm : 0));
  const base = w && h ? Math.min(w / plan.widthCm, h / plan.depthCm) : 0;
  const s = base * view.zoom;
  const ox = (w - plan.widthCm * s) / 2 + view.pan.x;
  const oy = (h - plan.depthCm * s) / 2 + view.pan.y;

  // Live position while dragging; committed to the parent on release.
  const [live, setLiveState] = useState<{ id: string; x: number; y: number } | null>(null);
  const liveRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const setLive = (v: { id: string; x: number; y: number } | null) => {
    const prev = liveRef.current;
    if (prev === v || (prev && v && prev.id === v.id && prev.x === v.x && prev.y === v.y)) return;
    liveRef.current = v;
    setLiveState(v);
  };

  const latest = useRef({ props, s, ox, oy, view, w, h });
  latest.current = { props, s, ox, oy, view, w, h };
  const gesture = useRef<Gesture | null>(null);

  const clampPan = (zoom: number, pan: { x: number; y: number }) => {
    const { w: cw, h: ch, props: p } = latest.current;
    const b = Math.min(cw / p.plan.widthCm, ch / p.plan.depthCm);
    const mx = Math.max(0, (p.plan.widthCm * b * zoom - cw) / 2 + 40);
    const my = Math.max(0, (p.plan.depthCm * b * zoom - ch) / 2 + 40);
    return { x: Math.max(-mx, Math.min(mx, pan.x)), y: Math.max(-my, Math.min(my, pan.y)) };
  };

  const startPinch = (e: GestureResponderEvent) => {
    const info = touchInfo(e);
    if (!info) return;
    const { view: v } = latest.current;
    gesture.current = { mode: 'pinch', moved: true, dist: info.dist, zoom: v.zoom, pan: v.pan, mid: { x: info.mid.x - origin.current.x, y: info.mid.y - origin.current.y } };
    setLive(null);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // While dragging, panning or pinching, never hand the touch to a parent ScrollView or navigator.
      onPanResponderTerminationRequest: () => !(gesture.current && gesture.current.mode !== 'tap'),
      onShouldBlockNativeResponder: () => Boolean(latest.current.props.editable || latest.current.props.zoomable),
      onPanResponderGrant: (e) => {
        const { props: p, s: sc, ox: x0, oy: y0, view: v } = latest.current;
        if (!sc) return;
        if (p.zoomable && e.nativeEvent.touches.length >= 2) return startPinch(e);
        const px = (e.nativeEvent.locationX - x0) / sc;
        const py = (e.nativeEvent.locationY - y0) / sc;
        // Tables win over landmarks; landmarks are selectable only in the editor.
        const table = [...p.plan.tables].reverse().find((x) => hitTest(x, px, py));
        const obj = p.editable ? [...p.plan.objects].reverse().find((x) => hitTest(x, px, py)) : undefined;
        const hit = (table ?? obj ?? null) as Element | null;
        if (p.editable && hit) gesture.current = { mode: 'drag', hit, moved: false };
        else if (p.zoomable && v.zoom > 1.01) gesture.current = { mode: 'pan', moved: false, pan: v.pan };
        else gesture.current = { mode: 'tap', hit, moved: false };
        if (p.editable && hit) p.onSelect?.(hit.id);
      },
      onPanResponderMove: (e, g) => {
        const cur = gesture.current;
        const { props: p, s: sc } = latest.current;
        if (!cur || !sc) return;
        if (p.zoomable && e.nativeEvent.touches.length >= 2 && cur.mode !== 'pinch') return startPinch(e);
        if (cur.mode === 'pinch') {
          const info = touchInfo(e);
          if (!info) return;
          const zoom = Math.min(MAX_ZOOM, Math.max(1, (cur.zoom * info.dist) / cur.dist));
          // Keep the point under the fingers in place while zooming.
          const mid = { x: info.mid.x - origin.current.x, y: info.mid.y - origin.current.y };
          const { w: cw, h: ch } = latest.current;
          const b = Math.min(cw / p.plan.widthCm, ch / p.plan.depthCm);
          const ox0 = (cw - p.plan.widthCm * b * cur.zoom) / 2 + cur.pan.x;
          const oy0 = (ch - p.plan.depthCm * b * cur.zoom) / 2 + cur.pan.y;
          const planX = (cur.mid.x - ox0) / (b * cur.zoom);
          const planY = (cur.mid.y - oy0) / (b * cur.zoom);
          const pan = { x: mid.x - planX * b * zoom - (cw - p.plan.widthCm * b * zoom) / 2, y: mid.y - planY * b * zoom - (ch - p.plan.depthCm * b * zoom) / 2 };
          setView({ zoom, pan: clampPan(zoom, pan) });
          return;
        }
        if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) cur.moved = true;
        if (!cur.moved) return;
        if (cur.mode === 'pan') {
          setView((v) => ({ ...v, pan: clampPan(v.zoom, { x: cur.pan.x + g.dx, y: cur.pan.y + g.dy }) }));
        } else if (cur.mode === 'drag' && cur.hit) {
          const el = cur.hit;
          const x = Math.min(Math.max(0, Math.round((el.x + g.dx / sc) / SNAP) * SNAP), p.plan.widthCm - el.width);
          const y = Math.min(Math.max(0, Math.round((el.y + g.dy / sc) / SNAP) * SNAP), p.plan.depthCm - el.depth);
          setLive({ id: el.id, x, y });
        }
      },
      onPanResponderRelease: () => {
        const cur = gesture.current;
        const p = latest.current.props;
        gesture.current = null;
        if (!cur) return;
        if (cur.mode === 'drag') {
          const l = liveRef.current;
          if (l && cur.hit && l.id === cur.hit.id && (l.x !== cur.hit.x || l.y !== cur.hit.y)) p.onMove?.(l.id, l.x, l.y);
          setLive(null);
        } else if (!cur.moved) {
          // A tap: opens a table in view mode; tapping empty space in the editor clears the selection.
          p.onSelect?.(cur.mode === 'tap' ? (cur.hit?.id ?? null) : null);
        }
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
        setLive(null);
      },
    }),
  ).current;

  const zoomBy = (f: number) => setView((v) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * f));
    return { zoom, pan: clampPan(zoom, { x: (v.pan.x * zoom) / v.zoom, y: (v.pan.y * zoom) / v.zoom }) };
  });

  const at = <T extends { id: string; x: number; y: number }>(el: T): T => (live && live.id === el.id ? { ...el, x: live.x, y: live.y } : el);
  const tables = plan.tables.map(at);
  const objects = plan.objects.map(at);
  const dark = t.scheme === 'dark';
  const grid = dark ? 'rgba(120,155,230,0.10)' : 'rgba(31,99,245,0.08)';
  const chair = dark ? '#5B6C92' : '#AFC0DD';
  const iconSize = (o: FloorPlanObjectView) => (Math.min(o.width, o.depth) * s < 14 ? 10 : Math.max(14, Math.min(26, Math.max(o.width, o.depth) * s * 0.28)));

  return (
    <View style={{ width: '100%', ...(fill ? { flex: 1 } : { height: h || 220 }) }}>
      <View
        ref={surface}
        onLayout={(e) => {
          setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
          surface.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
        }}
        pointerEvents="box-only"
        style={{ flex: 1, borderRadius: rounded ? t.radii.lg : 0, overflow: 'hidden', backgroundColor: t.colors.surfaceMuted, borderWidth: rounded ? 1 : 0, borderColor: live ? t.colors.primary : t.colors.border }}
        {...responder.panHandlers}
      >
        {referenceUrl && s ? <Image source={{ uri: resolveMedia(referenceUrl) ?? referenceUrl }} style={{ position: 'absolute', left: ox, top: oy, width: plan.widthCm * s, height: plan.depthCm * s, opacity: referenceOpacity }} resizeMode="stretch" /> : null}
        {s ? (
          <Svg width={w} height={h}>
            <Defs>
              <Pattern id="grid" width={50} height={50} patternUnits="userSpaceOnUse">
                <Line x1={0} y1={0} x2={50} y2={0} stroke={grid} strokeWidth={1.5} />
                <Line x1={0} y1={0} x2={0} y2={50} stroke={grid} strokeWidth={1.5} />
              </Pattern>
              <Pattern id="tiles" width={30} height={30} patternUnits="userSpaceOnUse">
                <Rect width={30} height={30} fill={OBJECT_STYLE.KITCHEN.fill} fillOpacity={0.18} />
                <Line x1={0} y1={0} x2={30} y2={0} stroke={OBJECT_STYLE.KITCHEN.fill} strokeOpacity={0.45} strokeWidth={2} />
                <Line x1={0} y1={0} x2={0} y2={30} stroke={OBJECT_STYLE.KITCHEN.fill} strokeOpacity={0.45} strokeWidth={2} />
              </Pattern>
              <Pattern id="wood" width={24} height={24} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={24} height={24} fill={OBJECT_STYLE.BAR.fill} fillOpacity={0.22} />
                <Line x1={0} y1={0} x2={0} y2={24} stroke={OBJECT_STYLE.BAR.fill} strokeOpacity={0.35} strokeWidth={6} />
              </Pattern>
            </Defs>
            <G x={ox} y={oy} scale={s}>
              <Rect x={0} y={0} width={plan.widthCm} height={plan.depthCm} fill="url(#grid)" stroke={t.colors.borderStrong} strokeWidth={2 / s} />
              {objects.map((o) => <Landmark key={o.id} o={o} selected={o.id === selectedId} primary={t.colors.primary} text={t.colors.text} iconCm={LANDMARK_ICON[o.kind] ? (iconSize(o) + 10) / s : 0} />)}
              {tables.map((tb) => {
                const color = statusColor(t.colors, tb.status);
                const sel = tb.id === selectedId;
                const cx = tb.x + tb.width / 2;
                const cy = tb.y + tb.depth / 2;
                const fs = Math.min(30, Math.max(16, Math.min(tb.width, tb.depth) / 3.4));
                return (
                  <G key={tb.id} rotation={tb.rotation} origin={`${cx}, ${cy}`} opacity={live && live.id !== tb.id ? 0.85 : 1}>
                    {seatOffsets(tb).map((st, i) => <Rect key={i} x={cx + st.x - 13} y={cy + st.y - 13} width={26} height={26} rx={9} fill={chair} />)}
                    {tb.shape === 'ROUND' ? (
                      <Ellipse cx={cx} cy={cy} rx={tb.width / 2} ry={tb.depth / 2} fill={color} fillOpacity={0.3} stroke={sel ? t.colors.primary : color} strokeWidth={sel ? 9 : 4} />
                    ) : (
                      <Rect x={tb.x} y={tb.y} width={tb.width} height={tb.depth} rx={12} fill={color} fillOpacity={0.3} stroke={sel ? t.colors.primary : color} strokeWidth={sel ? 9 : 4} />
                    )}
                    <G rotation={-tb.rotation} origin={`${cx}, ${cy}`}>
                      <SvgText x={cx} y={cy + fs * 0.1} fontSize={fs} fontWeight="800" fill={t.colors.text} textAnchor="middle">{tb.label}</SvgText>
                      <SvgText x={cx} y={cy + fs * 0.1 + fs * 0.85} fontSize={fs * 0.62} fontWeight="600" fill={t.colors.textSecondary} textAnchor="middle">{`${tb.capacity} seats`}</SvgText>
                    </G>
                  </G>
                );
              })}
            </G>
          </Svg>
        ) : null}
        {/* Recognisable icons for landmarks, kept upright and above the drawing. */}
        {s
          ? objects.map((o) => {
              const Icon = LANDMARK_ICON[o.kind];
              if (!Icon) return null;
              const size = iconSize(o);
              const d = size + 10;
              const cx = ox + (o.x + o.width / 2) * s;
              const cy = oy + (o.y + o.depth / 2) * s;
              if (cx < -d || cy < -d || cx > w + d || cy > h + d) return null;
              const left = Math.min(Math.max(2, cx - d / 2), w - d - 2);
              const top = Math.min(Math.max(2, cy - d / 2), h - d - 2);
              return (
                <View key={o.id} pointerEvents="none" style={{ position: 'absolute', left, top, width: d, height: d, borderRadius: d / 2, backgroundColor: OBJECT_STYLE[o.kind].fill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: dark ? '#0A1328' : '#fff' }}>
                  <Icon size={size} color="#fff" strokeWidth={2.2} />
                </View>
              );
            })
          : null}
      </View>
      {zoomable ? (
        <View style={{ position: 'absolute', right: 10, bottom: 10, gap: 8 }}>
          {[
            { icon: Plus, label: 'Zoom in', on: () => zoomBy(1.4) },
            { icon: Minus, label: 'Zoom out', on: () => zoomBy(1 / 1.4) },
            { icon: Maximize, label: 'Fit to screen', on: () => setView({ zoom: 1, pan: { x: 0, y: 0 } }) },
          ].map(({ icon: Icon, label, on }) => (
            <Pressable key={label} accessibilityLabel={label} onPress={on} hitSlop={4} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.colors.surfacePressed : t.colors.backgroundElevated, borderWidth: 1, borderColor: t.colors.border, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 })}>
              <Icon size={18} color={t.colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Landmark({ o, selected, primary, text, iconCm }: { o: FloorPlanObjectView; selected: boolean; primary: string; text: string; iconCm: number }) {
  const st = OBJECT_STYLE[o.kind];
  const cx = o.x + o.width / 2;
  const cy = o.y + o.depth / 2;
  const stroke = selected ? primary : st.fill;
  const sw = selected ? 8 : 3;
  const label = o.label ?? st.label;
  const fs = Math.min(26, o.width / 6);
  // With an icon in the middle, the label goes underneath it (if the shape is deep enough).
  const labelY = iconCm ? cy + iconCm / 2 + fs : cy + fs / 3;
  const showLabel = label && Math.max(o.width, o.depth) >= 120 && Math.min(o.width, o.depth) >= 60 && labelY < o.y + o.depth - 4;
  let body: React.ReactNode;
  switch (o.kind) {
    case 'WALL':
      body = <Rect x={o.x} y={o.y} width={o.width} height={o.depth} rx={3} fill={st.fill} stroke={selected ? primary : 'none'} strokeWidth={sw} />;
      break;
    case 'WINDOW':
      body = (
        <G>
          <Rect x={o.x} y={o.y} width={o.width} height={o.depth} fill={st.fill} fillOpacity={0.35} stroke={stroke} strokeWidth={selected ? sw : 2} />
          <Line x1={o.x} y1={cy} x2={o.x + o.width} y2={cy} stroke={st.fill} strokeWidth={3} />
        </G>
      );
      break;
    case 'ENTRANCE':
    case 'DOOR': {
      // Door leaf with its swing arc, drawn into the room.
      const r = Math.min(o.width, 160);
      body = (
        <G>
          <Rect x={o.x} y={o.y} width={o.width} height={o.depth} fill={st.fill} fillOpacity={0.55} stroke={stroke} strokeWidth={sw} strokeDasharray={o.kind === 'ENTRANCE' ? '14 8' : undefined} />
          <Path d={`M ${o.x} ${o.y + o.depth} L ${o.x} ${o.y + o.depth + r * 0.9} A ${r * 0.9} ${r * 0.9} 0 0 0 ${o.x + r * 0.9} ${o.y + o.depth}`} fill={st.fill} fillOpacity={0.12} stroke={st.fill} strokeWidth={2} strokeDasharray="6 6" />
        </G>
      );
      break;
    }
    case 'BAR': {
      // Counter with stools along the long customer side.
      const long = o.width >= o.depth;
      const n = Math.max(1, Math.floor((long ? o.width : o.depth) / 70));
      const stools = Array.from({ length: n }, (_, i) => {
        const along = ((i + 0.5) / n) * (long ? o.width : o.depth);
        return long ? { x: o.x + along, y: o.y + o.depth + 26 } : { x: o.x + o.width + 26, y: o.y + along };
      });
      body = (
        <G>
          <Rect x={o.x} y={o.y} width={o.width} height={o.depth} rx={14} fill="url(#wood)" stroke={stroke} strokeWidth={sw} />
          {stools.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={14} fill={st.fill} fillOpacity={0.55} />)}
        </G>
      );
      break;
    }
    case 'SCREEN':
    case 'TV':
      // Dark panel with a glowing picture.
      body = (
        <G>
          <Rect x={o.x} y={o.y} width={o.width} height={o.depth} rx={4} fill="#0B1020" stroke={stroke} strokeWidth={sw} />
          <Rect x={o.x + 4} y={o.y + Math.min(4, o.depth / 4)} width={Math.max(0, o.width - 8)} height={Math.max(2, o.depth - Math.min(8, o.depth / 2))} rx={2} fill={st.fill} fillOpacity={0.75} />
        </G>
      );
      break;
    case 'KITCHEN':
      body = <Rect x={o.x} y={o.y} width={o.width} height={o.depth} rx={8} fill="url(#tiles)" stroke={stroke} strokeWidth={sw} />;
      break;
    case 'PLANT':
    case 'PILLAR':
      body = <Ellipse cx={cx} cy={cy} rx={o.width / 2} ry={o.depth / 2} fill={st.fill} fillOpacity={0.45} stroke={stroke} strokeWidth={sw} />;
      break;
    default:
      body = <Rect x={o.x} y={o.y} width={o.width} height={o.depth} rx={10} fill={st.fill} fillOpacity={0.3} stroke={stroke} strokeWidth={sw} />;
  }
  return (
    <G rotation={o.rotation} origin={`${cx}, ${cy}`}>
      {body}
      {showLabel ? <SvgText x={cx} y={labelY} fontSize={fs} fontWeight="700" fill={text} textAnchor="middle" opacity={0.9}>{label}</SvgText> : null}
    </G>
  );
}
