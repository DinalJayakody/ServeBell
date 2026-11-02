import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useNavigation, usePreventRemove } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@servebell/api-client';
import { TableShape, type DetectedLayout, type FloorPlanDraft, type FloorObjectKind, type FloorPlanObjectView, type FloorPlanTableView, type FloorPlanView } from '@servebell/shared';
import { Badge, Button, Card, Chip, Input, InfoLabel, InfoTip, LoadingState, Screen, ScreenHeader, Text, useTheme } from '@servebell/design-system';
import { api, autoArrange, findFreeSpot, FloorPlan2D, FloorPlan3D, FloorPlanLegend, FloorPlanViewer, LANDMARK_ICON, LANDMARKS, newId, OBJECT_STYLE, pickAndUploadImage, TABLE_PRESETS } from '@servebell/mobile-core';
import { Armchair, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Camera, Check, Circle, CloudUpload, Copy, History, LayoutGrid, List, Map, Maximize2, Minimize2, RectangleHorizontal, RotateCcw, RotateCw, Ruler, Save, Shapes, Square, Trash2, WandSparkles } from 'lucide-react-native';
import { useActiveMembership } from '@/lib/active-restaurant';
import { StepperRow, ToggleRow } from '@/components/Form';

type Draft = Pick<FloorPlanView, 'name' | 'widthCm' | 'depthCm'> & { tables: FloorPlanTableView[]; objects: FloorPlanObjectView[] };
const NEW = 'new-';
const NUDGE = 10;
const localKey = (planId: string) => `floorplan-draft:${planId}`;
type LocalDraft = { draft: Draft; baseVersion: number; savedAt: number };

const GUIDE = {
  editor: 'Your floor plan shows guests where tables are and lets them pick one to reserve. Add tables and landmarks, drag them into place, then Save and Publish.',
  presets: 'Tap a size to add a table at the next free spot. You can drag it anywhere and change seats, shape and size afterwards.',
  landmarks: 'Landmarks help guests find their way. They show as icons on the plan and tell guests which tables are near the bar, window or entrance.',
  smart: 'Detect from photo: take a photo of the room from a corner and ServeBell suggests tables and landmarks. Auto-arrange: tidies all tables into rows with walkways. Trace: shows a photo or sketch under the plan so you can place tables on top.',
  publish: 'Save draft keeps your work without changing what guests see (other admins can continue it). Save applies the layout; if the plan is published, guests see it immediately. Your changes are also kept on this phone automatically, so nothing is lost if the app closes.',
  seats: 'How many guests the table seats. Guests can only reserve tables big enough for their party.',
  zone: 'Optional area name shown to guests, e.g. "Window side", "Terrace" or "Family area".',
  reservable: 'Turn off for walk-in-only tables. They still get a QR code for service requests.',
  active: 'Inactive tables are shown as unavailable and cannot be reserved or used.',
  position: 'Drag on the plan, or use the arrows to move by 10 cm for precise placement.',
  room: 'The real size of the room. Measure wall to wall; the plan keeps everything inside it.',
};

const nextLabel = (taken: string[]) => {
  const set = new Set(taken.map((l) => l.toLowerCase()));
  let n = taken.length + 1;
  while (set.has(`t${n}`)) n++;
  return `T${n}`;
};

/** Coordinate-based editor. 2D and 3D render the same draft, which is saved atomically. */
export default function FloorPlanEditor() {
  const t = useTheme();
  const qc = useQueryClient();
  const { membership } = useActiveMembership();
  const rid = membership?.restaurantId ?? '';
  const plans = useQuery({ queryKey: queryKeys.manageFloorPlans(rid), queryFn: () => api.floorPlans.manage(rid), enabled: !!rid });
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = plans.data?.find((p) => p.id === planId) ?? plans.data?.[0];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [sheet, setSheet] = useState<'tables' | 'items' | 'smart' | 'room'>('tables');
  const [sheetOpen, setSheetOpen] = useState(true);
  const [focus, setFocus] = useState(false);
  const [viewer, setViewer] = useState(false);
  // dirty: differs from the live layout. unsynced: not stored anywhere but this phone yet.
  const [dirty, setDirty] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const [restored, setRestored] = useState<{ from: 'device' | 'server'; at: number } | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const { height: winH } = useWindowDimensions();
  const [newRoom, setNewRoom] = useState({ name: 'Main dining', w: 1200, d: 900 });
  const [showRef, setShowRef] = useState(true);
  const allTables = useQuery({ queryKey: queryKeys.tables(rid), queryFn: () => api.tables.list(rid), enabled: !!rid });

  // Load once per plan version: device autosave (newest) > server draft > live layout.
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (!plan) return;
    const key = `${plan.id}:${plan.version}`;
    if (initFor.current === key || (dirty && initFor.current?.startsWith(`${plan.id}:`))) return;
    initFor.current = key;
    const live: Draft = { name: plan.name, widthCm: plan.widthCm, depthCm: plan.depthCm, tables: plan.tables, objects: plan.objects };
    setDraftSavedAt(plan.draftSavedAt ?? null);
    void (async () => {
      let local: LocalDraft | null = null;
      try { local = JSON.parse((await AsyncStorage.getItem(localKey(plan.id))) ?? 'null') as LocalDraft | null; } catch { local = null; }
      const serverAt = plan.draftSavedAt ? Date.parse(plan.draftSavedAt) : 0;
      if (local && local.savedAt > serverAt) {
        setDraft(local.draft); setDirty(true); setUnsynced(true); setRestored({ from: 'device', at: local.savedAt });
      } else if (plan.draft) {
        const d = plan.draft;
        const tableById = new globalThis.Map(plan.tables.map((x) => [x.id, x]));
        setDraft({
          name: d.name, widthCm: d.widthCm, depthCm: d.depthCm,
          tables: d.tables.map((x) => ({ ...(x.id && tableById.get(x.id) ? tableById.get(x.id)! : { status: 'AVAILABLE' as const, imageUrls: [], imageFileIds: [], description: null, features: [] }), ...x, id: x.id ?? x.clientKey ?? `${NEW}${newId()}`, zone: x.zone ?? null })),
          objects: d.objects.map((o) => ({ ...o, id: o.id ?? `${NEW}${newId()}`, label: o.label ?? null, height: o.height ?? null })),
        });
        setDirty(true); setUnsynced(false); setRestored({ from: 'server', at: serverAt });
      } else {
        setDraft(live); setDirty(false); setUnsynced(false); setRestored(null);
      }
    })();
  }, [plan, dirty]);

  const edit = (fn: (d: Draft) => Draft) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); setUnsynced(true); };

  // Autosave every change on this phone, and immediately when the app goes to the background.
  const latest = useRef({ draft, plan, unsynced });
  latest.current = { draft, plan, unsynced };
  const writeLocal = useCallback(() => {
    const { draft: d, plan: p, unsynced: u } = latest.current;
    if (!d || !p || !u) return;
    void AsyncStorage.setItem(localKey(p.id), JSON.stringify({ draft: d, baseVersion: p.version, savedAt: Date.now() } satisfies LocalDraft)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!unsynced) return;
    const h = setTimeout(writeLocal, 400);
    return () => clearTimeout(h);
  }, [draft, unsynced, writeLocal]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') writeLocal(); });
    return () => { sub.remove(); writeLocal(); };
  }, [writeLocal]);
  const clearLocal = (id: string) => AsyncStorage.removeItem(localKey(id)).catch(() => undefined);
  const selTable = draft?.tables.find((x) => x.id === selected);
  const selObj = draft?.objects.find((x) => x.id === selected);
  const sel = selTable ?? selObj;
  const patchSel = (patch: Partial<Omit<FloorPlanTableView, 'label'> & Omit<FloorPlanObjectView, 'label'>> & { label?: string | null }) =>
    edit((d) => ({ ...d, tables: d.tables.map((x) => (x.id === selected ? ({ ...x, ...patch } as FloorPlanTableView) : x)), objects: d.objects.map((x) => (x.id === selected ? ({ ...x, ...patch } as FloorPlanObjectView) : x)) }));
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));

  const payload = (d: Draft) => ({
    name: d.name,
    widthCm: d.widthCm,
    depthCm: d.depthCm,
    tables: d.tables.map(({ id, label, shape, capacity, zone, x, y, width, depth, rotation, isReservable, isActive }) => ({ ...(id.startsWith(NEW) ? { clientKey: id } : { id }), label, shape, capacity, zone, x, y, width, depth, rotation, isReservable, isActive })),
    objects: d.objects.map(({ id, kind, label, x, y, width, depth, height, rotation }) => ({ ...(id.startsWith(NEW) ? {} : { id }), kind, label, x, y, width, depth, height, rotation })),
  });
  const save = useMutation({
    mutationFn: () => api.floorPlans.save(rid, plan!.id, { expectedVersion: plan!.version, ...payload(draft!) }),
    onSuccess: (p) => {
      qc.setQueryData<FloorPlanView[]>(queryKeys.manageFloorPlans(rid), (old) => old?.map((x) => (x.id === p.id ? p : x)));
      void clearLocal(p.id);
      setDirty(false);
      setUnsynced(false);
      setRestored(null);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['floor-plans'] });
      void qc.invalidateQueries({ queryKey: queryKeys.qrCodes(rid) });
      void qc.invalidateQueries({ queryKey: queryKeys.tables(rid) });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'STALE_VERSION') {
        Alert.alert('Layout changed elsewhere', `${e.message} Your version is kept as a draft on this phone.`, [{ text: 'Reload', onPress: () => { writeLocal(); setDirty(false); setUnsynced(false); initFor.current = null; void plans.refetch(); } }]);
      } else Alert.alert('Couldn’t save', e.message);
    },
  });
  const saveDraft = useMutation({
    mutationFn: (d: Draft) => api.floorPlans.saveDraft(rid, plan!.id, { baseVersion: plan!.version, ...payload(d) } as FloorPlanDraft),
    onSuccess: (r) => { setUnsynced(false); setDraftSavedAt(r.draftSavedAt); void clearLocal(plan!.id); },
    onError: (e) => Alert.alert('Couldn’t save the draft', `${e.message}\n\nYour changes are still kept on this phone.`),
  });
  const discard = async () => {
    if (!plan) return;
    await clearLocal(plan.id);
    if (plan.draft || draftSavedAt) await api.floorPlans.discardDraft(rid, plan.id).catch(() => undefined);
    setDirty(false); setUnsynced(false); setRestored(null); setSelected(null); setDraftSavedAt(null);
    setDraft({ name: plan.name, widthCm: plan.widthCm, depthCm: plan.depthCm, tables: plan.tables, objects: plan.objects });
    void plans.refetch();
  };

  const navigation = useNavigation();
  // Never lose work: no swipe-back on this screen, and any exit asks what to do with unsaved changes.
  usePreventRemove(unsynced, ({ data }) => {
    Alert.alert('Save your changes?', 'You have changes that are not saved yet.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void clearLocal(plan!.id); setUnsynced(false); setTimeout(() => navigation.dispatch(data.action), 0); } },
      { text: 'Save draft', onPress: () => saveDraft.mutate(draft!, { onSuccess: () => setTimeout(() => navigation.dispatch(data.action), 0) }) },
    ]);
  });

  const publish = useMutation({ mutationFn: (p: boolean) => api.floorPlans.publish(rid, plan!.id, p), onSuccess: () => void plans.refetch(), onError: (e) => Alert.alert('Not yet', e.message) });
  const setReferenceInCache = (p: FloorPlanView | null) => p && qc.setQueryData<FloorPlanView[]>(queryKeys.manageFloorPlans(rid), (old) => old?.map((x) => (x.id === p.id ? { ...x, referenceUrl: p.referenceUrl } : x)));
  const reference = useMutation({
    mutationFn: async (clear: boolean) => {
      if (clear) return api.floorPlans.setReference(rid, plan!.id, null);
      const f = await pickAndUploadImage('FLOOR_REFERENCE', rid, [Math.round(draft!.widthCm / 100), Math.round(draft!.depthCm / 100)]);
      return f ? api.floorPlans.setReference(rid, plan!.id, f.id) : null;
    },
    onSuccess: setReferenceInCache,
    onError: (e) => Alert.alert('Couldn’t set reference', e.message),
  });
  const create = useMutation({ mutationFn: () => api.floorPlans.create(rid, { name: newRoom.name, widthCm: newRoom.w, depthCm: newRoom.d }), onSuccess: (p) => { setPlanId(p.id); void plans.refetch(); } });

  const applyDetected = (r: DetectedLayout, mode: 'replace' | 'add') =>
    edit((d) => {
      const keepTables = mode === 'replace' ? [] : d.tables;
      const keepObjects = mode === 'replace' ? d.objects.filter((o) => o.kind === 'WALL') : d.objects;
      const labels = keepTables.map((x) => x.label);
      const tables = r.tables.map((tb) => {
        const label = nextLabel(labels);
        labels.push(label);
        return { id: `${NEW}${newId()}`, label, zone: null, isReservable: true, isActive: true, status: 'AVAILABLE' as const, imageUrls: [], imageFileIds: [], description: null, features: [], ...tb };
      });
      const objects = r.landmarks.map((l) => ({ id: `${NEW}${newId()}`, label: null, height: null, ...l }));
      return { ...d, tables: [...keepTables, ...tables], objects: [...keepObjects, ...objects] };
    });

  const detect = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const f = await pickAndUploadImage('FLOOR_REFERENCE', rid, [4, 3], source);
      if (!f) return null;
      const result = await api.floorPlans.detect(rid, plan!.id, f.id);
      const withRef = await api.floorPlans.setReference(rid, plan!.id, f.id).catch(() => null);
      setReferenceInCache(withRef);
      return result;
    },
    onSuccess: (r) => {
      if (!r) return;
      const summary = `Found ${r.tables.length} table${r.tables.length === 1 ? '' : 's'} (${r.tables.reduce((s, x) => s + x.capacity, 0)} seats) and ${r.landmarks.length} landmark${r.landmarks.length === 1 ? '' : 's'}.${r.notes ? `\n\n${r.notes}` : ''}\n\nYou can drag anything to fine-tune before saving.`;
      Alert.alert('Layout suggestion ready', summary, [
        { text: 'Cancel', style: 'cancel' },
        ...(draft?.tables.length ? [{ text: 'Add to my layout', onPress: () => applyDetected(r, 'add') }] : []),
        { text: draft?.tables.length ? 'Replace my layout' : 'Use this layout', style: draft?.tables.length ? 'destructive' : 'default', onPress: () => applyDetected(r, 'replace') },
      ]);
    },
    onError: (e) => Alert.alert('Photo detection', e.message),
  });
  const askDetect = () =>
    Alert.alert('Detect tables from a photo', 'Stand in a corner and capture as much of the room as you can, in good light. You review everything before saving.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose photo', onPress: () => detect.mutate('library') },
      { text: 'Take photo', onPress: () => detect.mutate('camera') },
    ]);

  const placedBoxes = (d: Draft) => [...d.tables, ...d.objects];
  const addTable = (preset: (typeof TABLE_PRESETS)[number]) =>
    edit((d) => {
      const id = `${NEW}${newId()}`;
      const spot = findFreeSpot(d, placedBoxes(d), preset.w, preset.d);
      setSelected(id);
      return { ...d, tables: [...d.tables, { id, label: nextLabel(d.tables.map((x) => x.label)), shape: preset.shape, capacity: preset.capacity, zone: null, ...spot, width: preset.w, depth: preset.d, rotation: 0, isReservable: true, isActive: true, status: 'AVAILABLE', imageUrls: [], imageFileIds: [], description: null, features: [] }] };
    });
  const unplaced = (allTables.data ?? []).filter((x) => !x.floorPlanId && !draft?.tables.some((d) => d.id === x.id));
  const place = (x: (typeof unplaced)[number]) =>
    edit((d) => {
      const size = x.shape === 'RECTANGLE' ? { width: Math.max(160, x.capacity * 30), depth: 90 } : x.shape === 'ROUND' ? { width: x.capacity > 4 ? 140 : 100, depth: x.capacity > 4 ? 140 : 100 } : { width: 90, depth: 90 };
      const spot = findFreeSpot(d, placedBoxes(d), size.width, size.depth);
      setSelected(x.id);
      return { ...d, tables: [...d.tables, { id: x.id, label: x.label, shape: x.shape, capacity: x.capacity, zone: x.zone, ...spot, ...size, rotation: 0, isReservable: x.isReservable, isActive: x.isActive, status: x.status, imageUrls: [], imageFileIds: [], description: null, features: [] }] };
    });
  const addObject = (kind: FloorObjectKind) =>
    edit((d) => {
      const l = LANDMARKS.find((x) => x.kind === kind)!;
      const w = Math.min(l.w, d.widthCm);
      const dd = Math.min(l.d, d.depthCm);
      const id = `${NEW}${newId()}`;
      // Thin elements (entrance, window, door, wall) start on the near wall; others find space.
      const spot = dd <= 20 ? { x: Math.round((d.widthCm - w) / 2), y: d.depthCm - dd } : findFreeSpot(d, placedBoxes(d), w, dd, 20);
      setSelected(id);
      return { ...d, objects: [...d.objects, { id, kind, label: null, ...spot, width: w, depth: dd, height: null, rotation: 0 }] };
    });
  const duplicate = () =>
    edit((d) => {
      if (!sel) return d;
      const id = `${NEW}${newId()}`;
      const spot = findFreeSpot(d, placedBoxes(d), sel.width, sel.depth);
      setSelected(id);
      if (selTable) return { ...d, tables: [...d.tables, { ...selTable, id, label: nextLabel(d.tables.map((x) => x.label)), ...spot, imageUrls: [], imageFileIds: [], description: null, features: [] }] };
      return { ...d, objects: [...d.objects, { ...selObj!, id, ...spot }] };
    });
  const arrange = () =>
    Alert.alert('Auto-arrange tables?', 'All tables are placed in tidy rows with walkways, around your landmarks. You can still drag them afterwards.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Arrange', onPress: () => edit((d) => { const pos = autoArrange({ ...d, tables: d.tables }); return { ...d, tables: d.tables.map((x) => ({ ...x, ...(pos.get(x.id) ?? {}) })) }; }) },
    ]);
  const nudge = (dx: number, dy: number) => sel && draft && patchSel({ x: clamp(sel.x + dx, draft.widthCm - sel.width), y: clamp(sel.y + dy, draft.depthCm - sel.depth) });
  const move = (id: string, x: number, y: number) => edit((d) => ({ ...d, tables: d.tables.map((e) => (e.id === id ? { ...e, x, y } : e)), objects: d.objects.map((e) => (e.id === id ? { ...e, x, y } : e)) }));

  const geometry = useMemo(() => (draft ? { widthCm: draft.widthCm, depthCm: draft.depthCm, tables: draft.tables, objects: draft.objects } : null), [draft]);

  if (plans.isPending) return <Screen><LoadingState /></Screen>;
  if (!plans.data?.length) {
    return (
      <Screen scroll>
        <ScreenHeader title="Tables & floor plan" onBack={() => router.back()} info={GUIDE.editor} />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Map size={22} color={t.colors.primary} />
            <Text variant="title3" style={{ flex: 1 }}>Draw your floor plan</Text>
          </View>
          <Text variant="caption" color="textSecondary">Guests see where every table is and can pick one to reserve. Start with the room size; you can add tables from presets, detect them from a photo, and drag everything into place.</Text>
          <Input label="Floor name" info="E.g. Main dining, Rooftop, Ground floor. You can add more floors later." value={newRoom.name} onChangeText={(name) => setNewRoom({ ...newRoom, name })} />
          <StepperRow label="Width" info={GUIDE.room} value={newRoom.w} display={`${(newRoom.w / 100).toFixed(1)} m`} step={50} min={300} max={10000} onChange={(w) => setNewRoom({ ...newRoom, w })} />
          <StepperRow label="Depth" info={GUIDE.room} value={newRoom.d} display={`${(newRoom.d / 100).toFixed(1)} m`} step={50} min={300} max={10000} onChange={(d) => setNewRoom({ ...newRoom, d })} />
          <Button title="Create floor plan" loading={create.isPending} onPress={() => create.mutate()} />
        </Card>
        <Card style={{ gap: 10, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <List size={22} color={t.colors.primary} />
            <Text variant="title3" style={{ flex: 1 }}>Not now? Just list your tables</Text>
          </View>
          <Text variant="caption" color="textSecondary">A floor plan is optional. Add tables by name and seats to get QR codes and take reservations straight away. You can draw the plan later.</Text>
          <Button title="Manage tables without a plan" variant="secondary" onPress={() => router.push('/manage/tables')} />
        </Card>
      </Screen>
    );
  }
  if (!draft || !geometry || !plan) return <Screen><LoadingState /></Screen>;

  const busy = detect.isPending;
  const seats = draft.tables.reduce((s, x) => s + x.capacity, 0);
  const sheetMax = Math.round(winH * (sel ? 0.42 : 0.36));
  const floatBtn = { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.colors.backgroundElevated, borderWidth: 1, borderColor: t.colors.border, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 };
  const saveRow = (compact: boolean) => (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Button title={saveDraft.isPending ? 'Saving…' : compact ? 'Draft' : 'Save draft'} variant="outline" size="sm" style={{ flex: 1 }} icon={<CloudUpload size={15} color={t.colors.primary} />} disabled={!unsynced || saveDraft.isPending} onPress={() => saveDraft.mutate(draft)} />
      <Button title={plan.status === 'PUBLISHED' ? (compact ? 'Go live' : 'Save & go live') : 'Save'} size="sm" style={{ flex: 1.2 }} icon={<Save size={15} color="#fff" />} disabled={!dirty} loading={save.isPending} onPress={() => save.mutate()} />
      {compact ? null : <InfoTip text={GUIDE.publish} title="Saving" />}
    </View>
  );

  const tilesRow = (children: React.ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
  const tile = (key: string, icon: React.ReactNode, label: string, onPress: () => void, hint?: string) => (
    <Pressable key={key} onPress={onPress} onLongPress={hint ? () => Alert.alert(label, hint) : undefined} accessibilityLabel={`Add ${label}`} accessibilityHint={hint} style={({ pressed }) => ({ width: '22%', flexGrow: 1, alignItems: 'center', gap: 5, paddingVertical: 9, borderRadius: t.radii.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfacePressed : t.colors.surface })}>
      {icon}
      <Text variant="micro" align="center" numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  const inspector = sel ? (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {selObj && LANDMARK_ICON[selObj.kind] ? (() => { const Icon = LANDMARK_ICON[selObj.kind]!; return <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: OBJECT_STYLE[selObj.kind].fill, alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color="#fff" /></View>; })() : null}
        <Text variant="title3" style={{ flex: 1 }} numberOfLines={1}>{selTable ? `Table ${selTable.label} · ${selTable.capacity} seats` : LANDMARKS.find((l) => l.kind === selObj!.kind)?.label}</Text>
        <IconBtn label="Rotate left" onPress={() => patchSel({ rotation: ((sel.rotation - 15 + 540) % 360) - 180 })}><RotateCcw size={17} color={t.colors.primary} /></IconBtn>
        <IconBtn label="Rotate right" onPress={() => patchSel({ rotation: ((sel.rotation + 15 + 540) % 360) - 180 })}><RotateCw size={17} color={t.colors.primary} /></IconBtn>
        <IconBtn label="Duplicate" onPress={duplicate}><Copy size={17} color={t.colors.primary} /></IconBtn>
        <IconBtn label="Delete" onPress={() => { edit((d) => ({ ...d, tables: d.tables.filter((x) => x.id !== selected), objects: d.objects.filter((x) => x.id !== selected) })); setSelected(null); }}><Trash2 size={17} color={t.colors.danger} /></IconBtn>
        <IconBtn label="Done" onPress={() => setSelected(null)}><Check size={17} color={t.colors.success} /></IconBtn>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <InfoLabel label={`Move · ${sel.rotation}°`} info={GUIDE.position} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconBtn label="Move left" onPress={() => nudge(-NUDGE, 0)}><ArrowLeft size={17} color={t.colors.primary} /></IconBtn>
          <IconBtn label="Move up" onPress={() => nudge(0, -NUDGE)}><ArrowUp size={17} color={t.colors.primary} /></IconBtn>
          <IconBtn label="Move down" onPress={() => nudge(0, NUDGE)}><ArrowDown size={17} color={t.colors.primary} /></IconBtn>
          <IconBtn label="Move right" onPress={() => nudge(NUDGE, 0)}><ArrowRight size={17} color={t.colors.primary} /></IconBtn>
        </View>
      </View>
      {selTable ? (
        <>
          <StepperRow label="Seats" info={GUIDE.seats} value={selTable.capacity} min={1} max={50} onChange={(capacity) => patchSel({ capacity })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.values(TableShape).map((s) => {
              const Icon = s === 'ROUND' ? Circle : s === 'SQUARE' ? Square : RectangleHorizontal;
              const on = selTable.shape === s;
              return (
                <Pressable key={s} accessibilityLabel={`${s.toLowerCase()} table`} onPress={() => patchSel({ shape: s, ...(s === 'RECTANGLE' ? { width: Math.max(selTable.width, 160), depth: Math.min(selTable.depth, 100) } : { depth: selTable.width }) })} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: t.radii.md, borderWidth: 1, borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? t.colors.primarySoft : t.colors.surface }}>
                  <Icon size={16} color={on ? t.colors.primary : t.colors.textSecondary} />
                  <Text variant="micro" color={on ? 'primary' : 'textSecondary'}>{s.charAt(0) + s.slice(1).toLowerCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <StepperRow label="Width" info="Size from left to right, in centimetres." value={sel.width} display={`${sel.width} cm`} step={10} min={10} max={draft.widthCm} onChange={(width) => patchSel({ width, ...(selTable && selTable.shape !== 'RECTANGLE' ? { depth: width } : {}), x: clamp(sel.x, draft.widthCm - width) })} />
      {!selTable || selTable.shape === 'RECTANGLE' ? <StepperRow label="Depth" info="Size from front to back, in centimetres." value={sel.depth} display={`${sel.depth} cm`} step={5} min={5} max={draft.depthCm} onChange={(depth) => patchSel({ depth, y: clamp(sel.y, draft.depthCm - depth) })} /> : null}
      {selTable ? (
        <>
          <Input label="Table name" info="Shown on the plan, the QR sticker and to waiters. Must be unique." value={selTable.label} onChangeText={(label) => patchSel({ label })} maxLength={40} />
          <Input label="Zone (optional)" info={GUIDE.zone} value={selTable.zone ?? ''} onChangeText={(zone) => patchSel({ zone: zone || null })} placeholder="e.g. Window side" />
          <ToggleRow label="Reservable" info={GUIDE.reservable} value={selTable.isReservable} onChange={(isReservable) => patchSel({ isReservable })} />
          <ToggleRow label="Active" info={GUIDE.active} value={selTable.isActive} onChange={(isActive) => patchSel({ isActive })} />
          {!selTable.id.startsWith(NEW) ? <Button title="Description & photos" variant="secondary" size="sm" disabled={dirty} onPress={() => router.push({ pathname: '/manage/table/[id]', params: { id: selTable.id } })} /> : <Text variant="micro" color="textMuted">Save the layout to add photos and get this table’s QR code.</Text>}
        </>
      ) : (
        <Input label="Label (optional)" info="Replaces the default name on the plan, e.g. Main entrance or Cocktail bar." value={selObj!.label ?? ''} onChangeText={(label) => patchSel({ label: label || null })} />
      )}
    </View>
  ) : null;

  const tabs = (
    <View style={{ gap: 12 }}>
      {sheet === 'tables' ? (
        <>
          <InfoLabel label="Add a table" info={GUIDE.presets} variant="bodyStrong" color="text" />
          {tilesRow(TABLE_PRESETS.map((p) => {
            const Icon = p.shape === 'ROUND' ? Circle : p.shape === 'SQUARE' ? Square : RectangleHorizontal;
            return tile(p.key, <Icon size={20} color={t.colors.primary} />, p.label, () => addTable(p));
          }))}
          {unplaced.length ? (
            <>
              <InfoLabel label="Not on the plan yet" info="Tables you added from the table list. Tap one to place it on this floor; it keeps its name and QR code." variant="bodyStrong" color="text" />
              {tilesRow(unplaced.map((x) => <Chip key={x.id} label={`+ ${x.label} · ${x.capacity}`} onPress={() => place(x)} />))}
            </>
          ) : null}
        </>
      ) : sheet === 'items' ? (
        <>
          <InfoLabel label="Add an item" info={GUIDE.landmarks} variant="bodyStrong" color="text" />
          {tilesRow(LANDMARKS.map((l) => {
            const Icon = LANDMARK_ICON[l.kind];
            return tile(l.kind, <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: OBJECT_STYLE[l.kind].fill, alignItems: 'center', justifyContent: 'center' }}>{Icon ? <Icon size={15} color="#fff" /> : <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />}</View>, l.label, () => addObject(l.kind), l.hint);
          }))}
          <Text variant="micro" color="textMuted">Long-press an item to learn what it’s for.</Text>
        </>
      ) : sheet === 'smart' ? (
        <>
          <InfoLabel label="Smart tools" info={GUIDE.smart} variant="bodyStrong" color="text" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ToolTile icon={<Camera size={20} color={t.colors.primary} />} title="Detect from photo" subtitle="Tables & items" onPress={askDetect} loading={busy} />
            <ToolTile icon={<LayoutGrid size={20} color={t.colors.primary} />} title="Auto-arrange" subtitle="Tidy rows & aisles" onPress={arrange} disabled={!draft.tables.length} />
          </View>
          <InfoLabel label="Trace over a photo" info="Shows a photo, sketch or architect plan faintly under your layout, so you can drag tables exactly where they are. Guests never see it." variant="bodyStrong" color="text" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label={plan.referenceUrl ? 'Replace photo' : 'Choose photo'} onPress={() => reference.mutate(false)} />
            {plan.referenceUrl ? <Chip label={showRef ? 'Hide photo' : 'Show photo'} selected={showRef} onPress={() => setShowRef((v) => !v)} /> : null}
            {plan.referenceUrl ? <Chip label="Remove photo" onPress={() => reference.mutate(true)} /> : null}
          </View>
        </>
      ) : (
        <>
          <Input label="Floor name" info="Shown to guests when you have more than one floor." value={draft.name} onChangeText={(name) => edit((d) => ({ ...d, name }))} />
          <StepperRow label="Width" info={GUIDE.room} value={draft.widthCm} display={`${(draft.widthCm / 100).toFixed(1)} m`} step={50} min={300} max={10000} onChange={(widthCm) => edit((d) => ({ ...d, widthCm }))} />
          <StepperRow label="Depth" info={GUIDE.room} value={draft.depthCm} display={`${(draft.depthCm / 100).toFixed(1)} m`} step={50} min={300} max={10000} onChange={(depthCm) => edit((d) => ({ ...d, depthCm }))} />
          <FloorPlanLegend kinds={draft.objects.map((o) => o.kind)} statuses={['AVAILABLE']} />
          <Button title="Manage tables as a list" variant="secondary" size="sm" icon={<List size={16} color={t.colors.primary} />} onPress={() => router.push('/manage/tables')} />
        </>
      )}
    </View>
  );

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      {!focus ? (
        <View style={{ paddingHorizontal: 16, gap: 6, paddingBottom: 8 }}>
          <ScreenHeader
            title={draft.name}
            info={GUIDE.editor}
            subtitle={`${(draft.widthCm / 100).toFixed(1)} × ${(draft.depthCm / 100).toFixed(1)} m · ${draft.tables.length} tables · ${seats} seats`}
            onBack={() => router.back()}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={plan.status === 'PUBLISHED' ? 'Unpublish plan' : 'Publish plan'} disabled={dirty || publish.isPending}
                onPress={() => Alert.alert(plan.status === 'PUBLISHED' ? 'Hide this plan from guests?' : 'Show this plan to guests?', plan.status === 'PUBLISHED' ? 'Guests will no longer see the layout. Tables and QR codes keep working.' : 'Guests will see the layout and can pick tables to reserve.', [{ text: 'Cancel', style: 'cancel' }, { text: plan.status === 'PUBLISHED' ? 'Unpublish' : 'Publish', onPress: () => publish.mutate(plan.status !== 'PUBLISHED') }])}>
                <Badge label={plan.status === 'PUBLISHED' ? 'Published' : 'Not published'} tone={plan.status === 'PUBLISHED' ? 'success' : 'warning'} dot />
              </Pressable>
            }
          />
          {saveRow(false)}
          <Text variant="micro" color={unsynced ? 'warning' : 'textMuted'}>
            {unsynced ? 'Unsaved changes · kept on this phone automatically' : dirty ? `Draft saved${draftSavedAt ? ` ${new Date(draftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''} · not live yet` : plan.status === 'PUBLISHED' ? 'All changes saved · guests see this layout' : 'All changes saved · publish to show guests'}
          </Text>
          {restored ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderColor: t.colors.warning }}>
              <History size={18} color={t.colors.warning} />
              <Text variant="caption" style={{ flex: 1 }}>Draft restored ({restored.from === 'device' ? 'from this phone' : 'saved on the server'}, {new Date(restored.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}).</Text>
              <Button title="Discard" variant="ghost" size="sm" fullWidth={false} onPress={() => Alert.alert('Discard the draft?', 'You go back to the saved layout. This cannot be undone.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => void discard() }])} />
            </Card>
          ) : null}
          {plans.data.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {plans.data.map((p) => <Chip key={p.id} label={p.name} selected={p.id === plan.id} onPress={() => { if (!dirty) { setPlanId(p.id); setSelected(null); } else Alert.alert('Save first', 'Save or discard your changes before switching floors.'); }} />)}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {/* Canvas: fills all remaining space; drag, pinch to zoom, two fingers to pan. */}
      <View style={{ flex: 1 }}>
        {view === '2d' ? (
          <FloorPlan2D plan={geometry} referenceUrl={showRef ? plan.referenceUrl : null} selectedId={selected} onSelect={setSelected} editable onMove={move} fill zoomable rounded={false} />
        ) : (
          <FloorPlan3D plan={geometry} selectedId={selected} onSelect={setSelected} fill rounded={false} />
        )}
        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 8 }}>
          {focus ? (
            <Pressable accessibilityLabel="Exit focus mode" onPress={() => setFocus(false)} style={floatBtn}><Minimize2 size={18} color={t.colors.primary} /></Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.backgroundElevated }}>
            {(['2d', '3d'] as const).map((v) => (
              <Pressable key={v} accessibilityLabel={v === '2d' ? 'Edit in 2D' : '3D preview'} onPress={() => setView(v)} style={{ paddingHorizontal: 14, height: 40, justifyContent: 'center', backgroundColor: view === v ? t.colors.primary : 'transparent' }}>
                <Text variant="captionStrong" style={{ color: view === v ? '#fff' : t.colors.text }}>{v.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ position: 'absolute', top: 10, right: 10, gap: 8 }}>
          {!focus ? <Pressable accessibilityLabel="Focus mode: hide panels" onPress={() => { setFocus(true); setSelected(null); }} style={floatBtn}><Maximize2 size={18} color={t.colors.primary} /></Pressable> : null}
          <Pressable accessibilityLabel="Full-screen 3D preview" onPress={() => setViewer(true)} style={floatBtn}><Box size={18} color={t.colors.primary} /></Pressable>
        </View>
        {focus ? <View style={{ position: 'absolute', left: 10, right: 60, bottom: 12 }}>{saveRow(true)}</View> : null}
        {busy ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator color="#fff" />
            <Text variant="captionStrong" style={{ color: '#fff' }}>Reading your photo…</Text>
          </View>
        ) : null}
      </View>

      {!focus ? (
        <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: t.colors.backgroundElevated, borderTopWidth: 1, borderColor: t.colors.border, paddingTop: 6 }}>
          <Pressable accessibilityLabel={sheetOpen ? 'Collapse tools' : 'Expand tools'} onPress={() => setSheetOpen((o) => !o)} hitSlop={8} style={{ alignItems: 'center', paddingBottom: 6 }}>
            <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: t.colors.borderStrong }} />
          </Pressable>
          {sel ? null : (
            <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 6 }}>
              {([['tables', 'Tables', Armchair], ['items', 'Items', Shapes], ['smart', 'Smart', WandSparkles], ['room', 'Room', Ruler]] as const).map(([key, label, Icon]) => {
                const on = sheet === key;
                return (
                  <Pressable key={key} onPress={() => { setSheet(key); setSheetOpen(true); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 18, backgroundColor: on && sheetOpen ? t.colors.primarySoft : 'transparent' }}>
                    <Icon size={15} color={on && sheetOpen ? t.colors.primary : t.colors.textSecondary} />
                    <Text variant="captionStrong" color={on && sheetOpen ? 'primary' : 'textSecondary'}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {sheetOpen || sel ? (
            <ScrollView style={{ maxHeight: sheetMax }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
              {sel ? inspector : tabs}
            </ScrollView>
          ) : <View style={{ height: 16 }} />}
        </View>
      ) : null}
      <FloorPlanViewer visible={viewer} onClose={() => setViewer(false)} plan={geometry} title={`${draft.name} · preview`} statuses={['AVAILABLE']} />
    </Screen>
  );
}

function IconBtn({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.colors.surfacePressed : t.colors.primarySoft })}>
      {children}
    </Pressable>
  );
}

function ToolTile({ icon, title, subtitle, onPress, loading, disabled }: { icon: React.ReactNode; title: string; subtitle: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: t.radii.lg, borderWidth: 1, borderColor: t.colors.primary, backgroundColor: pressed ? t.colors.surfacePressed : t.colors.primarySoft, opacity: disabled ? 0.5 : 1 })}>
      {loading ? <ActivityIndicator color={t.colors.primary} /> : icon}
      <View style={{ flex: 1 }}>
        <Text variant="captionStrong">{title}</Text>
        <Text variant="micro" color="textSecondary">{subtitle}</Text>
      </View>
    </Pressable>
  );
}
