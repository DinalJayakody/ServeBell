import type { ComponentType } from 'react';
import { View } from 'react-native';
import { AppWindow, ChefHat, Columns3, DoorClosed, DoorOpen, Martini, MicVocal, Projector, Sprout, Toilet, Tv, type LucideProps } from 'lucide-react-native';
import type { FloorObjectKind, TableShape, TableStatus } from '@servebell/shared';
import { Text, useTheme } from '@servebell/design-system';
import { OBJECT_STYLE, statusColor, TABLE_STATUS_LABEL } from './model';

/** Icons that make landmarks recognisable at a glance (walls and "other" stay plain). */
export const LANDMARK_ICON: Partial<Record<FloorObjectKind, ComponentType<LucideProps>>> = {
  ENTRANCE: DoorOpen,
  DOOR: DoorClosed,
  BAR: Martini,
  KITCHEN: ChefHat,
  RESTROOM: Toilet,
  STAGE: MicVocal,
  PLANT: Sprout,
  WINDOW: AppWindow,
  PILLAR: Columns3,
  SCREEN: Projector,
  TV: Tv,
};

/** Palette shown in the editor, in the order owners usually need them. */
export const LANDMARKS: { kind: FloorObjectKind; label: string; hint: string; w: number; d: number }[] = [
  { kind: 'ENTRANCE', label: 'Entrance', hint: 'Where guests walk in. Helps guests and waiters find their way.', w: 160, d: 20 },
  { kind: 'BAR', label: 'Bar', hint: 'Bar counter. Stools are drawn on the long side automatically.', w: 300, d: 70 },
  { kind: 'KITCHEN', label: 'Kitchen', hint: 'Kitchen or service pass. Guests see it as a landmark, not a table.', w: 300, d: 200 },
  { kind: 'RESTROOM', label: 'Restroom', hint: 'Toilets, so guests know which tables are close by.', w: 200, d: 150 },
  { kind: 'WINDOW', label: 'Window', hint: 'Place along a wall. Tables nearby show "window side".', w: 200, d: 15 },
  { kind: 'DOOR', label: 'Door', hint: 'Staff or side door.', w: 100, d: 15 },
  { kind: 'SCREEN', label: 'Big screen', hint: 'Projector or big screen for sports and events. Guests can pick tables with a good view.', w: 300, d: 20 },
  { kind: 'TV', label: 'TV', hint: 'Television on a stand or wall.', w: 120, d: 40 },
  { kind: 'STAGE', label: 'Stage', hint: 'Live music or a performance area.', w: 300, d: 200 },
  { kind: 'PLANT', label: 'Plant', hint: 'Decorative plant or divider.', w: 50, d: 50 },
  { kind: 'PILLAR', label: 'Pillar', hint: 'Column that blocks space.', w: 40, d: 40 },
  { kind: 'WALL', label: 'Wall', hint: 'Interior wall or partition. Rotate it with the rotation control.', w: 300, d: 15 },
];

/** Common table sizes, so owners rarely need to type dimensions. */
export const TABLE_PRESETS: { key: string; label: string; shape: TableShape; capacity: number; w: number; d: number }[] = [
  { key: 'r2', label: '2 · round', shape: 'ROUND', capacity: 2, w: 70, d: 70 },
  { key: 's2', label: '2 · square', shape: 'SQUARE', capacity: 2, w: 70, d: 70 },
  { key: 's4', label: '4 · square', shape: 'SQUARE', capacity: 4, w: 90, d: 90 },
  { key: 'r4', label: '4 · round', shape: 'ROUND', capacity: 4, w: 100, d: 100 },
  { key: 'r6', label: '6 · round', shape: 'ROUND', capacity: 6, w: 140, d: 140 },
  { key: 'l6', label: '6 · long', shape: 'RECTANGLE', capacity: 6, w: 180, d: 90 },
  { key: 'l8', label: '8 · long', shape: 'RECTANGLE', capacity: 8, w: 240, d: 100 },
  { key: 'l12', label: '12 · banquet', shape: 'RECTANGLE', capacity: 12, w: 360, d: 100 },
];

/** Status colours plus the landmarks that appear on this plan. */
export function FloorPlanLegend({ kinds = [], statuses = ['AVAILABLE', 'RESERVED', 'OCCUPIED'] }: { kinds?: FloorObjectKind[]; statuses?: TableStatus[] }) {
  const t = useTheme();
  const shown = [...new Set(kinds)].filter((k) => LANDMARK_ICON[k]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
      {statuses.map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: statusColor(t.colors, s) }} />
          <Text variant="micro" color="textSecondary">{TABLE_STATUS_LABEL[s]}</Text>
        </View>
      ))}
      {shown.map((k) => {
        const Icon = LANDMARK_ICON[k]!;
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: OBJECT_STYLE[k].fill, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={11} color="#fff" strokeWidth={2.4} />
            </View>
            <Text variant="micro" color="textSecondary">{LANDMARKS.find((l) => l.kind === k)?.label ?? k}</Text>
          </View>
        );
      })}
    </View>
  );
}
