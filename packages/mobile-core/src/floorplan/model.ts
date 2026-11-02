import type { FloorObjectKind, FloorPlanObjectView, FloorPlanTableView, TableStatus } from '@servebell/shared';
import type { ColorScheme } from '@servebell/design-system';

/** Shared geometry helpers for the 2D blueprint and the 3D scene (same data, same maths). */
export interface PlanGeometry {
  widthCm: number;
  depthCm: number;
  tables: FloorPlanTableView[];
  objects: FloorPlanObjectView[];
}

export function statusColor(c: ColorScheme, s: TableStatus) {
  return { AVAILABLE: c.success, OCCUPIED: c.danger, RESERVED: c.warning, UNAVAILABLE: c.textMuted }[s];
}

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = { AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved soon', UNAVAILABLE: 'Unavailable' };

export const OBJECT_STYLE: Record<FloorObjectKind, { fill: string; label?: string }> = {
  WALL: { fill: '#3A4B70' },
  WINDOW: { fill: '#7CC4FF' },
  DOOR: { fill: '#B98A5A', label: 'Door' },
  ENTRANCE: { fill: '#1FD1B2', label: 'Entrance' },
  PILLAR: { fill: '#5A6B8F' },
  BAR: { fill: '#8A5CF6', label: 'Bar' },
  KITCHEN: { fill: '#F5A524', label: 'Kitchen' },
  RESTROOM: { fill: '#5B9BFF', label: 'WC' },
  STAGE: { fill: '#E879F9', label: 'Stage' },
  PLANT: { fill: '#34D399' },
  SCREEN: { fill: '#0EA5E9', label: 'Big screen' },
  TV: { fill: '#6366F1', label: 'TV' },
  OTHER: { fill: '#94A3B8' },
};

/** Seat positions (cm, relative to table centre, unrotated). */
export function seatOffsets(t: Pick<FloorPlanTableView, 'shape' | 'capacity' | 'width' | 'depth'>): { x: number; y: number }[] {
  const n = Math.min(t.capacity, 16);
  if (t.shape === 'ROUND') {
    const r = Math.max(t.width, t.depth) / 2 + 18;
    return Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * r, y: Math.sin((i / n) * Math.PI * 2) * r }));
  }
  const long = t.width >= t.depth;
  const perSide = Math.ceil(n / 2);
  const span = long ? t.width : t.depth;
  const off = (long ? t.depth : t.width) / 2 + 16;
  return Array.from({ length: n }, (_, i) => {
    const side = i < perSide ? -1 : 1;
    const k = i < perSide ? i : i - perSide;
    const count = i < perSide ? perSide : n - perSide;
    const along = -span / 2 + (span / (count + 1)) * (k + 1);
    return long ? { x: along, y: side * off } : { x: side * off, y: along };
  });
}

/** Point-in-rotated-rectangle hit test, in cm. */
export function hitTest(el: { x: number; y: number; width: number; depth: number; rotation: number }, px: number, py: number) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.depth / 2;
  const r = (-el.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= el.width / 2 + 10 && Math.abs(ly) <= el.depth / 2 + 10;
}

type Box = { x: number; y: number; width: number; depth: number; rotation?: number };
const overlaps = (a: Box, b: Box, gap: number) => {
  const ra = rotatedBoundsLocal(a);
  const rb = rotatedBoundsLocal(b);
  return ra.minX < rb.maxX + gap && rb.minX < ra.maxX + gap && ra.minY < rb.maxY + gap && rb.minY < ra.maxY + gap;
};
function rotatedBoundsLocal(g: Box) {
  const r = ((g.rotation ?? 0) * Math.PI) / 180;
  const w = g.width * Math.abs(Math.cos(r)) + g.depth * Math.abs(Math.sin(r));
  const d = g.width * Math.abs(Math.sin(r)) + g.depth * Math.abs(Math.cos(r));
  const cx = g.x + g.width / 2;
  const cy = g.y + g.depth / 2;
  return { minX: cx - w / 2, minY: cy - d / 2, maxX: cx + w / 2, maxY: cy + d / 2 };
}

/** Clearance for chairs plus a walkway between tables. */
export const AISLE_CM = 70;

/**
 * First free top-left position (row by row from the top-left) for a w×d element,
 * keeping `gap` cm from everything already placed. Falls back to the room centre.
 */
export function findFreeSpot(plan: { widthCm: number; depthCm: number }, placed: Box[], w: number, d: number, gap = AISLE_CM) {
  const margin = Math.min(gap, 40);
  for (let y = margin; y + d <= plan.depthCm - margin / 2; y += 10) {
    for (let x = margin; x + w <= plan.widthCm - margin / 2; x += 10) {
      const box = { x, y, width: w, depth: d };
      if (!placed.some((p) => overlaps(box, p, gap))) return { x, y };
    }
  }
  return { x: Math.max(0, Math.round((plan.widthCm - w) / 2)), y: Math.max(0, Math.round((plan.depthCm - d) / 2)) };
}

/** Re-places every table in tidy rows around the landmarks, biggest first. Returns new positions by id. */
export function autoArrange(plan: PlanGeometry) {
  const placed: Box[] = plan.objects.map((o) => ({ ...o }));
  const out = new Map<string, { x: number; y: number; rotation: number }>();
  const tables = [...plan.tables].sort((a, b) => b.width * b.depth - a.width * a.depth || a.label.localeCompare(b.label, undefined, { numeric: true }));
  for (const tb of tables) {
    const spot = findFreeSpot(plan, placed, tb.width, tb.depth);
    placed.push({ ...spot, width: tb.width, depth: tb.depth });
    out.set(tb.id, { ...spot, rotation: 0 });
  }
  return out;
}
