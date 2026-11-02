import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@servebell/api-client';
import { Chip, InfoLabel, SegmentedControl, Skeleton, Text, useTheme } from '@servebell/design-system';
import { api, FloorPlan2D, FloorPlan3D, FloorPlanLegend, FloorPlanViewer } from '@servebell/mobile-core';
import { Pressable } from 'react-native';
import { Expand } from 'lucide-react-native';

/** Customer view of the restaurant layout: same data in 2D and 3D; tap a table for details. */
export function RestaurantLayout({ slug, initialMode = '2d' }: { slug: string; initialMode?: '2d' | '3d' }) {
  const t = useTheme();
  const plans = useQuery({ queryKey: queryKeys.floorPlans(slug), queryFn: () => api.floorPlans.published(slug), refetchInterval: 60_000 });
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'2d' | '3d'>(initialMode);
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => setMode(initialMode), [initialMode]);
  if (plans.isPending) return <Skeleton height={240} radius={t.radii.lg} />;
  if (!plans.data?.length) return null;
  const plan = plans.data[Math.min(index, plans.data.length - 1)]!;
  const open = (id: string | null) => {
    setSelected(id);
    if (id) router.push({ pathname: '/table/[id]', params: { id, slug } });
  };
  return (
    <View style={{ gap: 10 }}>
      <InfoLabel label="Table layout" variant="title3" color="text" info="A live map of the dining room. Green tables are free now, amber are reserved soon, red are taken. Icons show the entrance, bar, kitchen and restrooms. Tap any table to see photos and reserve it." />
      {plans.data.length > 1 ? <View style={{ flexDirection: 'row', gap: 8 }}>{plans.data.map((p, i) => <Chip key={p.id} label={p.name} selected={i === index} onPress={() => setIndex(i)} />)}</View> : null}
      <SegmentedControl value={mode} onChange={setMode} options={[{ value: '2d', label: 'Floor plan' }, { value: '3d', label: '3D view' }]} />
      <View>
        {mode === '2d' ? <FloorPlan2D plan={plan} selectedId={selected} onSelect={open} /> : <FloorPlan3D plan={plan} selectedId={selected} onSelect={open} height={300} />}
        <Pressable onPress={() => setFull(true)} accessibilityLabel="View full screen" style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: t.colors.backgroundElevated, borderWidth: 1, borderColor: t.colors.border }}>
          <Expand size={15} color={t.colors.primary} />
          <Text variant="captionStrong" color="primary">Full screen</Text>
        </Pressable>
      </View>
      <FloorPlanViewer visible={full} onClose={() => setFull(false)} plan={plan} title={`${plan.name} · live`} initialMode={mode} onSelectTable={(id) => { setFull(false); open(id); }} />
      <FloorPlanLegend kinds={plan.objects.map((o) => o.kind)} />
      <Text variant="micro" color="textMuted">Tap a table to see details and reserve · {plan.tables.filter((x) => x.status === 'AVAILABLE').length} of {plan.tables.length} free now</Text>
    </View>
  );
}
