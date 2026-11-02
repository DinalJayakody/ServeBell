import { useState } from 'react';
import { Modal, Pressable, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { SegmentedControl, Text, useTheme } from '@servebell/design-system';
import { FloorPlan2D } from './FloorPlan2D';
import { FloorPlan3D } from './FloorPlan3D';
import { FloorPlanLegend } from './landmarks';
import type { PlanGeometry } from './model';

/** Full-screen 2D/3D preview (portrait or landscape). Tapping a table calls onSelectTable. */
export function FloorPlanViewer({ visible, onClose, plan, title, initialMode = '3d', onSelectTable, statuses }: {
  visible: boolean;
  onClose: () => void;
  plan: PlanGeometry;
  title: string;
  initialMode?: '2d' | '3d';
  onSelectTable?: (id: string) => void;
  statuses?: Parameters<typeof FloorPlanLegend>[0]['statuses'];
}) {
  const t = useTheme();
  const [mode, setMode] = useState<'2d' | '3d'>(initialMode);
  const [guests, setGuests] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const select = (id: string | null) => {
    setSelected(id);
    if (id && onSelectTable) onSelectTable(id);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close full screen" hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface }}>
            <X size={20} color={t.colors.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <SegmentedControl value={mode} onChange={setMode} options={[{ value: '2d', label: 'Floor plan' }, { value: '3d', label: '3D' }]} />
          </View>
          {mode === '3d' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="micro" color="textSecondary">Guests</Text>
              <Switch value={guests} onValueChange={setGuests} trackColor={{ true: t.colors.primary, false: t.colors.surfacePressed }} thumbColor="#fff" accessibilityLabel="Show a guest on every seat" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          {mode === '2d' ? <FloorPlan2D plan={plan} selectedId={selected} onSelect={select} fill zoomable /> : <FloorPlan3D plan={plan} selectedId={selected} onSelect={select} fill showGuests={guests} />}
        </View>
        <View style={{ padding: 12, gap: 6 }}>
          <FloorPlanLegend kinds={plan.objects.map((o) => o.kind)} statuses={statuses} />
          <Text variant="micro" color="textMuted">{mode === '3d' ? 'Drag to look around · pinch to zoom · tap a table' : 'Pinch to zoom · drag to move around · tap a table'}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
