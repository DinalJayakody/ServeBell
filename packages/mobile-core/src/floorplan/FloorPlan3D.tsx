import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, View, type GestureResponderEvent } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { Text, useTheme } from '@servebell/design-system';
import { OBJECT_STYLE, statusColor, type PlanGeometry } from './model';
import { LANDMARK_ICON, LANDMARKS } from './landmarks';
import { Users } from 'lucide-react-native';
import { buildObject, buildTable, disposeTree, makeKit, mergeStatic, type Kit } from './three/models';

interface Stage {
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  content: THREE.Group;
  sun: THREE.DirectionalLight;
}

interface Label { id: string; text: string; sub?: string; color: string; kind: 'table' | 'landmark'; icon?: keyof typeof LANDMARK_ICON; anchor: THREE.Vector3 }
interface Placed { id: string; x: number; y: number }

const FPS_MS = 1000 / 30;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * 3D view generated from exactly the same rows as the 2D blueprint:
 * x(cm) → X(m), y(cm) → Z(m), rotation(° clockwise) → −Y rotation.
 * Detailed procedural models, names floating above items, gentle animations
 * (30 fps, paused in the background and when "Reduce Motion" is on).
 * One finger orbits, two fingers zoom, tap selects a table.
 */
export interface FloorPlan3DProps {
  plan: PlanGeometry;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Fixed height; omit with `fill` to take all available space. */
  height?: number;
  fill?: boolean;
  labels?: boolean;
  /** Seat a guest on every chair to show how many each table holds. */
  showGuests?: boolean;
  rounded?: boolean;
}

export function FloorPlan3D({ plan, selectedId, onSelect, height = 320, fill, labels = true, showGuests = false, rounded = true }: FloorPlan3DProps) {
  const t = useTheme();
  const stage = useRef<Stage | null>(null);
  const kit = useRef<Kit | null>(null);
  const cam = useRef({ yaw: -0.6, pitch: 0.85, zoom: 1, start: { yaw: 0, pitch: 0, zoom: 1, dist: 0 }, lastTouch: 0, intro: 0 });
  const size = useRef({ w: 1, h: 1 });
  const labelDefs = useRef<Label[]>([]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [motion, setMotion] = useState(true);
  const dirty = useRef(true);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const W = plan.widthCm / 100;
  const D = plan.depthCm / 100;
  const baseRadius = Math.max(W, D) * 1.0 + 2.5;
  const dark = t.scheme === 'dark';

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => setMotion(!r));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => setMotion(!r));
    return () => sub.remove();
  }, []);

  const positionCamera = useCallback(() => {
    const s = stage.current;
    if (!s) return;
    const c = cam.current;
    const intro = motion ? easeOut(Math.min(1, c.intro)) : 1;
    const radius = baseRadius * c.zoom * (1 + (1 - intro) * 0.8);
    const pitch = c.pitch + (1 - intro) * 0.45;
    const yaw = c.yaw - (1 - intro) * 0.9;
    s.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius, Math.cos(yaw) * Math.cos(pitch) * radius);
    s.camera.lookAt(0, 0.4, 0);
  }, [baseRadius, motion]);

  const projectLabels = useCallback(() => {
    const s = stage.current;
    if (!s || !labels) return;
    s.camera.updateMatrixWorld();
    const out: Placed[] = [];
    const v = new THREE.Vector3();
    for (const l of labelDefs.current) {
      v.copy(l.anchor).project(s.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      out.push({ id: l.id, x: Math.round(((v.x + 1) / 2) * size.current.w), y: Math.round(((1 - v.y) / 2) * size.current.h) });
    }
    setPlaced((prev) => (prev.length === out.length && prev.every((p, i) => p.id === out[i]!.id && Math.abs(p.x - out[i]!.x) < 1 && Math.abs(p.y - out[i]!.y) < 1) ? prev : out));
  }, [labels]);

  // Self-pacing: after a frame, wait for the GPU (a synchronous GL call) and space frames by how
  // long it took. Fast phones stay near 30 fps; slow devices get fewer frames instead of a backlog.
  const frameBudget = useRef(FPS_MS);
  const draw = useCallback(() => {
    const s = stage.current;
    if (!s) return;
    positionCamera();
    s.renderer.render(s.scene, s.camera);
    s.gl.endFrameEXP();
    const t0 = Date.now();
    s.gl.getError();
    frameBudget.current = Math.min(1000, Math.max(FPS_MS, (Date.now() - t0) * 2.5));
  }, [positionCamera]);

  const build = useCallback(() => {
    const s = stage.current;
    if (!s) return;
    disposeTree(s.content);
    s.content.clear();
    kit.current?.dispose();
    s.scene.background = new THREE.Color(dark ? '#0B1530' : '#E9F0FB');
    s.scene.fog = new THREE.Fog(dark ? '#0B1530' : '#E9F0FB', baseRadius * 1.6, baseRadius * 3.2);
    const k: Kit = makeKit(dark, motion, showGuests);
    kit.current = k;
    const defs: Label[] = [];
    const place = (o: THREE.Object3D, x: number, y: number, w: number, d: number, rot: number) => {
      o.position.set((x + w / 2) / 100 - W / 2, 0, (y + d / 2) / 100 - D / 2);
      o.rotation.y = (-rot * Math.PI) / 180;
      s.content.add(o);
    };

    // Floor (wooden planks) and a low wall around the room.
    (k.m.floor.map as THREE.Texture).repeat.set(W / 2.4, D / 2.4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), k.m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.content.add(floor);
    for (const [w, d, x, z] of [[W + 0.2, 0.1, 0, -D / 2 - 0.05], [W + 0.2, 0.1, 0, D / 2 + 0.05], [0.1, D, -W / 2 - 0.05, 0], [0.1, D, W / 2 + 0.05, 0]] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), k.m.wall);
      wall.position.set(x, 0.175, z);
      s.content.add(wall);
    }

    for (const o of plan.objects) {
      const { group, labelY } = buildObject(k, o);
      place(group, o.x, o.y, o.width, o.depth, o.rotation);
      if (o.kind !== 'WALL') {
        const info = LANDMARKS.find((l) => l.kind === o.kind);
        defs.push({ id: o.id, text: o.label ?? info?.label ?? o.kind, color: OBJECT_STYLE[o.kind].fill, kind: 'landmark', icon: o.kind, anchor: group.position.clone().setY(labelY) });
      }
    }
    for (const tb of plan.tables) {
      const { group, labelY } = buildTable(k, tb, statusColor(t.colors, tb.status), t.colors.primary);
      place(group, tb.x, tb.y, tb.width, tb.depth, tb.rotation);
      defs.push({ id: tb.id, text: tb.label, sub: String(tb.capacity), color: statusColor(t.colors, tb.status), kind: 'table', anchor: group.position.clone().setY(labelY) });
    }
    // Static parts become a handful of meshes.
    mergeStatic(s.content);
    labelDefs.current = defs;
    const sel = selectedId ? k.rings.get(selectedId) : undefined;
    if (sel) sel.visible = true;
    dirty.current = true;
    draw();
    projectLabels();
    // selectedId is applied separately below so selecting never rebuilds the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, dark, t.colors, W, D, motion, showGuests, baseRadius, draw, projectLabels]);

  useEffect(build, [build]);

  // Selection: show the pulsing ring without rebuilding.
  useEffect(() => {
    const k = kit.current;
    if (!k) return;
    k.rings.forEach((r, id) => (r.visible = id === selectedId));
    dirty.current = true;
    if (!motion) draw();
  }, [selectedId, motion, draw]);

  // Animation loop (30 fps). Idle animations, intro fly-in and slow auto-orbit.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let active = AppState.currentState === 'active';
    let labelTick = 0;
    const start = Date.now();
    const sub = AppState.addEventListener('change', (st) => { active = st === 'active'; });
    const loop = () => {
      raf = requestAnimationFrame(loop);
      step();
    };
    const step = () => {
      const now = Date.now();
      if (!active || !stage.current || now - last < frameBudget.current) return;
      const dt = Math.min(200, now - last);
      last = now;
      const c = cam.current;
      const time = (now - start) / 1000;
      let moving = false;
      if (motion) {
        if (c.intro < 1) { c.intro = Math.min(1, c.intro + dt / 1400); moving = true; }
        if (now - c.lastTouch > 5000 && c.intro >= 1) { c.yaw += dt * 0.00008; moving = true; }
        kit.current?.anims.forEach((a) => a(time));
        const sel = selectedRef.current ? kit.current?.rings.get(selectedRef.current) : undefined;
        if (sel) { const p = 1 + Math.sin(time * 4) * 0.04; sel.scale.set(p, p, 1); (sel.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 4) * 0.3; }
      } else if (!dirty.current) return;
      dirty.current = false;
      draw();
      if (moving || ++labelTick % 6 === 0) projectLabels();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); sub.remove(); };
  }, [motion, draw, projectLabels]);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      const canvas = {
        width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, clientHeight: gl.drawingBufferHeight,
        addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => gl,
      } as unknown as HTMLCanvasElement;
      // three ≥ r163 rejects contexts that are `instanceof WebGLRenderingContext`; expo-gl's
      // context is WebGL2-capable but registered under that prototype. Letting three obtain it
      // through canvas.getContext('webgl2') avoids the false "WebGL 1" rejection.
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(1);
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      // No shadow maps: they render to an off-screen framebuffer, which expo-gl does not switch
      // back from reliably, and they are costly on phones. Soft blob shadows are baked into the models.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.9));
      const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
      sun.position.set(5, 11, 7);
      scene.add(sun);
      const content = new THREE.Group();
      scene.add(content);
      const camera = new THREE.PerspectiveCamera(40, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 200);
      stage.current = { gl, renderer, scene, camera, content, sun };
      cam.current.intro = 0;
      build();
    },
    [build],
  );

  // Dispose only on a real unmount: development mode runs effects twice, and the GL context
  // is created once, so tearing the stage down on the first cleanup would freeze the view.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      setTimeout(() => {
        if (alive.current) return;
        const s = stage.current;
        if (s) { disposeTree(s.content); kit.current?.dispose(); s.renderer.dispose(); }
        stage.current = null;
      }, 0);
    };
  }, []);

  const pick = useCallback(
    (px: number, py: number) => {
      const s = stage.current;
      if (!s) return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((px / size.current.w) * 2 - 1, -(py / size.current.h) * 2 + 1), s.camera);
      const hit = ray.intersectObjects(s.content.children, true).find((h) => h.object.userData.tableId);
      onSelect?.((hit?.object.userData.tableId as string | undefined) ?? null);
    },
    [onSelect],
  );
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const pinch = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const c = cam.current;
        c.lastTouch = Date.now();
        c.intro = 1;
        c.start = { yaw: c.yaw, pitch: c.pitch, zoom: c.zoom, dist: pinch(e) };
      },
      onPanResponderMove: (e, g) => {
        const c = cam.current;
        c.lastTouch = Date.now();
        const dist = pinch(e);
        if (dist && c.start.dist) c.zoom = Math.min(1.8, Math.max(0.45, c.start.zoom * (c.start.dist / dist)));
        else if (dist) c.start = { ...c.start, dist, zoom: c.zoom };
        else {
          c.yaw = c.start.yaw - g.dx / 160;
          c.pitch = Math.min(1.4, Math.max(0.25, c.start.pitch + g.dy / 240));
        }
        dirty.current = true;
      },
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6 && !cam.current.start.dist) pickRef.current(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
    }),
  ).current;

  const byId = new Map(labelDefs.current.map((l) => [l.id, l]));
  return (
    <View
      style={{ ...(fill ? { flex: 1 } : { height }), borderRadius: rounded ? t.radii.lg : 0, overflow: 'hidden', borderWidth: rounded ? 1 : 0, borderColor: t.colors.border, backgroundColor: t.colors.surfaceMuted }}
      onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; projectLabels(); }}
      {...responder.panHandlers}
    >
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
      {labels
        ? placed.map((p) => {
            const l = byId.get(p.id);
            if (!l) return null;
            const sel = p.id === selectedId;
            const Icon = l.icon ? LANDMARK_ICON[l.icon] : undefined;
            return (
              <View key={p.id} pointerEvents="none" style={{ position: 'absolute', left: p.x - 60, top: p.y - 14, width: 120, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: sel ? t.colors.primary : dark ? 'rgba(10,19,40,0.82)' : 'rgba(255,255,255,0.9)', borderWidth: 1.5, borderColor: sel ? '#fff' : l.color }}>
                  {Icon ? <Icon size={11} color={l.color} strokeWidth={2.5} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: l.color }} />}
                  <Text variant="micro" style={{ fontWeight: '800', color: sel ? '#fff' : t.colors.text }} numberOfLines={1}>{l.text}</Text>
                  {l.sub ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                      <Users size={9} color={sel ? '#fff' : t.colors.textSecondary} />
                      <Text variant="micro" style={{ color: sel ? '#fff' : t.colors.textSecondary, fontSize: 9 }}>{l.sub}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}
