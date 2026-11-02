import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloorPlanObjectView, FloorPlanTableView } from '@servebell/shared';
import { seatOffsets } from '../model';

/**
 * Procedural 3D models for the floor plan, built from primitives (no downloaded assets), so the
 * 3D view stays small, works offline and always matches the saved geometry.
 *
 * Performance: everything that does not move is merged into one mesh per material after the
 * scene is built (see mergeStatic), people are a few vertex-coloured meshes each, bottles are
 * instanced, and geometries/materials are shared through the kit caches.
 * Units are metres; each model is centred on its footprint, X = width, Z = depth.
 */

export type Anim = (t: number) => void;

export interface Kit {
  m: ReturnType<typeof makeMaterials>;
  anims: Anim[];
  /** Pulsing selection ring per table id. */
  rings: Map<string, THREE.Mesh>;
  motion: boolean;
  /** Seat guests at every table (preview of how many each table holds). */
  fillSeats: boolean;
  geo: <G extends THREE.BufferGeometry>(key: string, make: () => G) => G;
  mat: <M extends THREE.Material>(key: string, make: () => M) => M;
  /** Releases every cached geometry, material and texture. */
  dispose: () => void;
}

export function makeKit(dark: boolean, motion: boolean, fillSeats: boolean): Kit {
  const geos = new Map<string, THREE.BufferGeometry>();
  const mats = new Map<string, THREE.Material>();
  const m = makeMaterials(dark);
  return {
    m,
    anims: [],
    rings: new Map(),
    motion,
    fillSeats,
    geo: (key, make) => {
      let g = geos.get(key);
      if (!g) { g = make(); g.userData.shared = true; geos.set(key, g); }
      return g as never;
    },
    mat: (key, make) => (mats.get(key) ?? mats.set(key, make()).get(key)) as never,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      const all = [...mats.values(), ...Object.values(m).flat()] as THREE.Material[];
      for (const mat of all) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }
    },
  };
}

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const glow = (color: string, intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

export function makeMaterials(dark: boolean) {
  return {
    floor: std('#ffffff', { roughness: 0.75, map: woodFloorTexture(dark) }),
    tiles: std('#ffffff', { roughness: 0.35, map: tileTexture() }),
    wall: std(dark ? '#2A3A5E' : '#F2F4F8', { roughness: 0.9 }),
    tableTop: std('#E3CDAE', { roughness: 0.45 }),
    tableEdge: std('#9C7349', { roughness: 0.5 }),
    wood: std('#A8733F', { roughness: 0.55 }),
    woodDark: std('#4E3220', { roughness: 0.45 }),
    metal: std('#8C96A3', { metalness: 0.75, roughness: 0.35 }),
    steel: std('#C9D1DA', { metalness: 0.85, roughness: 0.22 }),
    black: std('#14161B', { roughness: 0.35 }),
    white: std('#F6F5F2', { roughness: 0.4 }),
    marble: std('#ECE9E3', { roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#A9DBFF', transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    seat: std('#2F4A73', { roughness: 0.8 }),
    leather: std('#8C2F2F', { roughness: 0.5 }),
    terracotta: std('#C4623F', { roughness: 0.85 }),
    soil: std('#3A2A1E', { roughness: 1 }),
    leaves: ['#2E8B4F', '#3DA25E', '#23763F', '#4CB36B'].map((c) => std(c, { roughness: 0.8, flatShading: true })),
    plate: std('#FFFFFF', { roughness: 0.25 }),
    wax: std('#FFF6E3', { roughness: 0.7 }),
    food: ['#E9A23B', '#C0392B', '#6AA84F', '#F1C232'].map((c) => std(c, { roughness: 0.7 })),
    flame: glow('#FFB347', 2.2),
    warm: glow('#FFC772', 1.6),
    led: glow('#7C5CFF', 1.4),
    exit: glow('#22C55E', 1.6),
    heat: glow('#FF7A2F', 1.8),
    burner: glow('#3B82F6', 1.6),
    backlight: glow('#F59E0B', 0.9),
    steam: new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.35, depthWrite: false }),
    shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }),
    beam: new THREE.MeshBasicMaterial({ color: '#FFE7A8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    mat: std('#7A1F2B', { roughness: 1 }),
    rope: std('#333842'),
    person: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  };
}

// ── Procedural textures (DataTexture works on expo-gl without a canvas) ──
function texture(size: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = paint(x, y);
    data.set([r, g, b, 255], (y * size + x) * 4);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
function woodFloorTexture(dark: boolean) {
  const base = dark ? [92, 70, 52] : [196, 160, 120];
  return texture(64, (x, y) => {
    const board = Math.floor(y / 8);
    const seam = y % 8 === 0 || (x + board * 23) % 64 === 0;
    const grain = Math.sin(x * 0.35 + board * 3.1) * 7 + ((x * 13 + y * 7) % 5);
    const k = seam ? -38 : grain + (board % 3) * 6;
    return [base[0]! + k, base[1]! + k * 0.85, base[2]! + k * 0.7];
  });
}
function tileTexture() {
  return texture(32, (x, y) => {
    const grout = x % 16 === 0 || y % 16 === 0;
    const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
    return grout ? [150, 150, 150] : checker ? [238, 238, 236] : [60, 64, 72];
  });
}

// ── Small helpers ──
const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
const dynamic = <T extends THREE.Object3D>(o: T): T => { o.userData.dynamic = true; return o; };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

function box(k: Kit, w: number, h: number, d: number, m: THREE.Material) {
  return mesh(k.geo(`b${r2(w)},${r2(h)},${r2(d)}`, () => new THREE.BoxGeometry(w, h, d)), m);
}
function cyl(k: Kit, rt: number, rb: number, h: number, m: THREE.Material, seg = 20) {
  return mesh(k.geo(`c${r2(rt)},${r2(rb)},${r2(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m);
}

/** Geometry with a solid vertex colour, so several parts can share one draw call. */
function tint(g: THREE.BufferGeometry, color: string, m?: THREE.Matrix4) {
  const out = (g.index ? g.toNonIndexed() : g.clone());
  if (m) out.applyMatrix4(m);
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name);
  const c = new THREE.Color(color);
  const n = out.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}
const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

const CLOTHES = ['#E4572E', '#29335C', '#F3A712', '#669BBC', '#A8C686', '#B56576', '#6D597A', '#2A9D8F'];
const SKIN = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
const HAIR = ['#1E1B18', '#3B2618', '#7A4E2D', '#C9A15B', '#5A5A5A'];
const PANTS = '#2B2F3A';

/**
 * A person in three draw calls: body (vertex-coloured), head and one gesturing arm.
 * `pose` drives the animation: seated guests eat and chat, staff work.
 */
function person(k: Kit, seed: number, opts: { seated?: boolean; outfit?: string; hat?: boolean; apron?: boolean } = {}) {
  const clothes = opts.outfit ?? CLOTHES[seed % CLOTHES.length]!;
  const skin = SKIN[(seed >> 3) % SKIN.length]!;
  const hair = HAIR[(seed >> 5) % HAIR.length]!;
  const hip = opts.seated ? 0.47 : 0.85;
  const key = `p${opts.seated ? 's' : 'w'}${clothes}${skin}${hair}${opts.hat ? 'h' : ''}${opts.apron ? 'a' : ''}`;
  const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 1, 8);
  const body = k.geo(`${key}body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    if (opts.seated) {
      for (const s of [-1, 1]) {
        parts.push(tint(legGeo, PANTS, T(s * 0.08, hip, -0.16, Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 0.36, 1))));
        parts.push(tint(legGeo, PANTS, T(s * 0.08, hip - 0.24, -0.33).multiply(new THREE.Matrix4().makeScale(1, 0.44, 1))));
      }
    } else for (const s of [-1, 1]) parts.push(tint(legGeo, PANTS, T(s * 0.08, 0.41, 0).multiply(new THREE.Matrix4().makeScale(1, 0.82, 1))));
    parts.push(tint(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), clothes, T(0, hip + 0.32, 0)));
    if (opts.apron) parts.push(tint(new THREE.BoxGeometry(0.26, 0.5, 0.02), '#E5E7EB', T(0, hip + 0.2, -0.15)));
    parts.push(tint(new THREE.CapsuleGeometry(0.045, 0.32, 3, 8), clothes, T(0.2, hip + 0.32, opts.seated ? -0.1 : 0, opts.seated ? -0.9 : 0)));
    return mergeGeometries(parts)!;
  });
  const headGeo = k.geo(`${key}head`, () => {
    const parts = [tint(new THREE.SphereGeometry(0.11, 14, 10), skin), tint(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, T(0, 0.01, 0.01))];
    if (opts.hat) parts.push(tint(new THREE.CylinderGeometry(0.1, 0.09, 0.16, 12), '#FFFFFF', T(0, 0.15, 0)), tint(new THREE.SphereGeometry(0.12, 12, 8), '#FFFFFF', T(0, 0.26, 0)));
    return mergeGeometries(parts)!;
  });
  const armGeo = k.geo(`${key}arm`, () => mergeGeometries([tint(new THREE.CapsuleGeometry(0.045, 0.3, 3, 8), clothes, T(0, -0.17, 0)), tint(new THREE.SphereGeometry(0.045, 8, 6), skin, T(0, -0.36, 0))])!);

  const g = dynamic(new THREE.Group());
  const torso = mesh(body, k.m.person);
  const head = at(mesh(headGeo, k.m.person), 0, hip + 0.72, 0);
  const arm = at(mesh(armGeo, k.m.person), -0.2, hip + 0.48, 0);
  arm.rotation.x = opts.seated ? -1.0 : 0;
  g.add(torso, head, arm);
  g.userData.parts = { torso, head, arm, hip };
  return g;
}

function animateGuest(k: Kit, p: THREE.Group, seed: number) {
  if (!k.motion) return;
  const { torso, head, arm } = p.userData.parts as { torso: THREE.Mesh; head: THREE.Mesh; arm: THREE.Mesh };
  const ph = (seed % 100) / 13;
  k.anims.push((t) => {
    torso.scale.y = 1 + Math.sin(t * 1.6 + ph) * 0.012;
    head.rotation.y = Math.sin(t * 0.45 + ph) * 0.5;
    head.rotation.x = Math.sin(t * 0.9 + ph) * 0.06;
    // Eating: fork up to the mouth now and then.
    const bite = Math.max(0, Math.sin(t * 0.9 + ph * 2));
    arm.rotation.x = -1.0 - bite * bite * 0.9;
  });
}

function chair(k: Kit) {
  const g = new THREE.Group();
  g.add(at(box(k, 0.42, 0.05, 0.42, k.m.seat), 0, 0.45, 0), at(box(k, 0.42, 0.42, 0.04, k.m.wood), 0, 0.68, 0.19));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) g.add(at(cyl(k, 0.018, 0.015, 0.45, k.m.woodDark, 6), x, 0.225, z));
  return g;
}

export const TABLE_TOP = 0.75;

/** Dining table with chairs, place settings and a candle; seated guests when occupied (or previewing). */
export function buildTable(k: Kit, tb: FloorPlanTableView, statusColor: string, primary: string) {
  const g = new THREE.Group();
  const w = tb.width / 100;
  const d = tb.depth / 100;
  const H = TABLE_TOP;
  const round = tb.shape === 'ROUND';
  if (round) {
    g.add(at(cyl(k, w / 2, w / 2, 0.04, k.m.tableTop, 32), 0, H - 0.02, 0));
    g.add(at(cyl(k, w / 2 + 0.005, w / 2 - 0.01, 0.025, k.m.tableEdge, 32), 0, H - 0.05, 0));
    g.add(at(cyl(k, 0.05, 0.05, H - 0.06, k.m.metal, 10), 0, (H - 0.06) / 2, 0));
    g.add(at(cyl(k, Math.min(0.28, w * 0.25), Math.min(0.3, w * 0.28), 0.03, k.m.metal, 20), 0, 0.015, 0));
  } else {
    g.add(at(box(k, w, 0.04, d, k.m.tableTop), 0, H - 0.02, 0));
    g.add(at(box(k, w - 0.04, 0.06, d - 0.04, k.m.tableEdge), 0, H - 0.07, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(k, 0.05, H - 0.04, 0.05, k.m.woodDark), sx * (w / 2 - 0.07), (H - 0.04) / 2, sz * (d / 2 - 0.07)));
  }
  const seats = seatOffsets(tb);
  const seed = hash(tb.id);
  const seated = tb.status === 'OCCUPIED' || k.fillSeats;
  seats.forEach((s, i) => {
    const c = chair(k);
    c.position.set(s.x / 100, 0, s.y / 100);
    c.rotation.y = Math.atan2(s.x, s.y);
    g.add(c);
    const len = Math.hypot(s.x, s.y) || 1;
    const ux = s.x / len;
    const uz = s.y / len;
    const reach = round ? w / 2 - 0.14 : Math.min((w / 2 - 0.13) / Math.max(Math.abs(ux), 1e-3), (d / 2 - 0.13) / Math.max(Math.abs(uz), 1e-3));
    g.add(at(cyl(k, 0.1, 0.085, 0.015, k.m.plate, 16), ux * reach, H + 0.008, uz * reach));
    g.add(at(cyl(k, 0.03, 0.025, 0.11, k.m.glass, 8), ux * reach + uz * 0.13, H + 0.055, uz * reach - ux * 0.13));
    if (seated) {
      // A little food on the plate, and the guest.
      g.add(at(new THREE.Mesh(k.geo('food', () => new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), k.m.food[(seed + i) % k.m.food.length]!), ux * reach, H + 0.015, uz * reach));
      const p = person(k, seed + i * 7919, { seated: true });
      p.position.set((s.x / 100) * 0.92, 0, (s.y / 100) * 0.92);
      p.rotation.y = Math.atan2(s.x, s.y);
      animateGuest(k, p, seed + i * 31);
      g.add(p);
    }
  });
  g.add(at(cyl(k, 0.025, 0.025, 0.07, k.m.wax, 8), 0, H + 0.035, 0));
  const flame = dynamic(at(new THREE.Mesh(k.geo('flame', () => new THREE.ConeGeometry(0.014, 0.04, 6)), k.m.flame), 0, H + 0.095, 0));
  g.add(flame);
  if (k.motion) {
    const ph = (seed % 50) / 7;
    k.anims.push((t) => flame.scale.set(1 + Math.sin(t * 13 + ph) * 0.12, 1 + Math.sin(t * 9 + ph) * 0.2, 1));
  }
  if (tb.status === 'RESERVED') {
    const gold = k.mat('gold', () => std('#F5B841', { metalness: 0.4, roughness: 0.35 }));
    for (const s of [-1, 1]) {
      const p = at(box(k, 0.14, 0.09, 0.004, gold), round ? 0.12 : Math.min(0.2, w / 4), H + 0.045, s * 0.02);
      p.rotation.x = s * 0.35;
      g.add(p);
    }
  }
  // Soft contact shadow under the table and chairs.
  const blob = new THREE.Mesh(k.geo('blob', () => new THREE.CircleGeometry(0.5, 24)), k.m.shadow);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.003;
  blob.scale.set(w + 0.5, (round ? w : d) + 0.5, 1);
  g.add(blob);
  const outer = Math.max(w, d) / 2 + 0.55;
  const ringMat = k.mat(`ring${statusColor}`, () => new THREE.MeshBasicMaterial({ color: statusColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(outer - 0.06, outer, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  if (!round) ring.scale.set(w >= d ? 1 : (w / 2 + 0.55) / outer, d >= w ? 1 : (d / 2 + 0.55) / outer, 1);
  g.add(ring);
  const sel = dynamic(new THREE.Mesh(new THREE.RingGeometry(outer + 0.02, outer + 0.14, 40), new THREE.MeshBasicMaterial({ color: primary, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
  sel.rotation.x = -Math.PI / 2;
  sel.position.y = 0.008;
  sel.visible = false;
  g.add(sel);
  k.rings.set(tb.id, sel);
  // Invisible hit box keeps taps working after static parts are merged.
  const hit = dynamic(at(new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 1.2, d + 0.8), new THREE.MeshBasicMaterial({ visible: false })), 0, 0.6, 0));
  hit.userData.tableId = tb.id;
  g.add(hit);
  return { group: g, labelY: H + 0.85 };
}

/** Animated cricket broadcast drawn with flat shapes on a screen of size sw × sh. */
function cricketScreen(k: Kit, sw: number, sh: number) {
  const g = dynamic(new THREE.Group());
  const flat = (w: number, h: number, color: string, x: number, y: number, z = 0) => at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), k.mat(`flat${color}`, () => new THREE.MeshBasicMaterial({ color }))), x, y, z);
  g.add(flat(sw, sh, '#2E7D32', 0, 0));
  g.add(flat(sw, sh * 0.22, '#7FB3E6', 0, sh * 0.39, 0.001)); // crowd/sky band
  for (let i = 0; i < 10; i++) g.add(flat(sw * 0.07, sh * 0.06, ['#F4D35E', '#EE6C4D', '#FFFFFF', '#3D5A80'][i % 4]!, -sw / 2 + (i + 0.5) * (sw / 10), sh * 0.33, 0.002));
  g.add(flat(sw * 0.16, sh * 0.62, '#C8A96A', 0, -sh * 0.08, 0.002)); // pitch
  for (const y of [sh * 0.16, -sh * 0.32]) {
    g.add(flat(sw * 0.2, sh * 0.008, '#FFFFFF', 0, y, 0.003));
    for (const x of [-0.018, 0, 0.018]) g.add(flat(sw * 0.006, sh * 0.06, '#FFF3D6', x * sw, y + sh * 0.03, 0.004));
  }
  const batter = new THREE.Group();
  batter.position.set(sw * 0.03, -sh * 0.27, 0.005);
  batter.add(flat(sw * 0.03, sh * 0.1, '#1D4ED8', 0, 0), flat(sw * 0.02, sh * 0.035, '#F1C27D', 0, sh * 0.07));
  const bat = flat(sw * 0.008, sh * 0.09, '#D9B48A', sw * 0.02, -sh * 0.02);
  batter.add(bat);
  const bowler = new THREE.Group();
  bowler.add(flat(sw * 0.03, sh * 0.1, '#DC2626', 0, 0), flat(sw * 0.02, sh * 0.035, '#C68642', 0, sh * 0.07));
  bowler.position.set(0, sh * 0.22, 0.005);
  const ball = flat(sw * 0.014, sw * 0.014, '#FAFAFA', 0, 0, 0.006);
  const scoreBg = flat(sw * 0.5, sh * 0.09, '#0F172A', -sw * 0.22, -sh * 0.44, 0.007);
  const runs = flat(sw * 0.1, sh * 0.045, '#FACC15', -sw * 0.2, -sh * 0.44, 0.008);
  g.add(batter, bowler, ball, scoreBg, flat(sw * 0.06, sh * 0.06, '#16A34A', -sw * 0.42, -sh * 0.44, 0.008), runs);
  if (k.motion) {
    k.anims.push((t) => {
      const c = (t % 3.2) / 3.2;
      bowler.position.y = sh * (0.32 - Math.min(c, 0.35) * 0.3);
      if (c < 0.35) ball.visible = false;
      else if (c < 0.7) {
        const p = (c - 0.35) / 0.35;
        ball.visible = true;
        ball.position.set(0, sh * (0.18 - p * 0.42), 0.006);
      } else {
        const p = (c - 0.7) / 0.3;
        ball.position.set(p * sw * 0.45, -sh * 0.24 + Math.sin(p * Math.PI) * sh * 0.3, 0.006);
      }
      bat.rotation.z = c > 0.62 && c < 0.8 ? -1.4 * Math.sin(((c - 0.62) / 0.18) * Math.PI) : 0;
      runs.scale.x = 1 + (Math.floor(t / 3.2) % 6) * 0.15;
    });
  }
  return g;
}

/** Landmark models: recognisable furniture rather than boxes. */
export function buildObject(k: Kit, o: FloorPlanObjectView): { group: THREE.Group; labelY: number } {
  const w = Math.max(o.width / 100, 0.05);
  const d = Math.max(o.depth / 100, 0.05);
  const g = new THREE.Group();
  if (o.kind !== 'WINDOW' && o.kind !== 'WALL') {
    const blob = new THREE.Mesh(k.geo('blobsq', () => new THREE.PlaneGeometry(1, 1)), k.m.shadow);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.002;
    blob.scale.set(w + 0.3, d + 0.3, 1);
    g.add(blob);
  }
  const m = k.m;
  const seed = hash(o.id ?? o.kind);
  switch (o.kind) {
    case 'BAR': {
      const along = new THREE.Group();
      const L = Math.max(w, d);
      const D = Math.min(w, d);
      const front = D * 0.25;
      along.add(at(box(k, L, 1.0, D * 0.55, m.woodDark), 0, 0.5, front));
      along.add(at(box(k, L + 0.06, 0.05, D * 0.55 + 0.12, m.marble), 0, 1.03, front));
      const led = dynamic(at(box(k, L, 0.04, 0.02, m.led), 0, 0.12, front + D * 0.275 + 0.01));
      along.add(led);
      // Back bar: lit bottle rack with instanced bottles (one draw call for all of them).
      const backZ = -D / 2 + 0.1;
      along.add(at(box(k, L, 1.9, 0.16, m.wood), 0, 0.95, backZ));
      const light = dynamic(at(box(k, L - 0.1, 1.3, 0.01, m.backlight), 0, 1.25, backZ + 0.085));
      along.add(light);
      const perShelf = Math.max(3, Math.floor(L / 0.11));
      const bottles = dynamic(new THREE.InstancedMesh(k.geo('bottle', () => mergeGeometries([new THREE.CylinderGeometry(0.028, 0.032, 0.24, 8), new THREE.CylinderGeometry(0.011, 0.011, 0.09, 6).translate(0, 0.16, 0)])!), std('#ffffff', { roughness: 0.15, metalness: 0.1 }), perShelf * 3));
      const colors = ['#2F7D4A', '#B5651D', '#DCEBF2', '#8E1B2C', '#E3B23C'].map((c) => new THREE.Color(c));
      const mtx = new THREE.Matrix4();
      for (let shelf = 0; shelf < 3; shelf++) {
        along.add(at(box(k, L - 0.04, 0.025, 0.2, m.woodDark), 0, 0.85 + shelf * 0.42, backZ + 0.1));
        for (let i = 0; i < perShelf; i++) {
          const idx = shelf * perShelf + i;
          mtx.makeTranslation(-L / 2 + 0.08 + i * ((L - 0.16) / Math.max(1, perShelf - 1)), 0.99 + shelf * 0.42, backZ + 0.1);
          bottles.setMatrixAt(idx, mtx);
          bottles.setColorAt(idx, colors[(idx * 7 + shelf) % colors.length]!);
        }
      }
      along.add(bottles);
      // A bottle on the counter that tilts to pour into a glass.
      const pour = dynamic(new THREE.Group());
      pour.position.set(L * 0.15, 1.06, front);
      pour.add(at(new THREE.Mesh(bottles.geometry, k.mat('amber', () => std('#B5651D', { roughness: 0.15 }))), 0, 0.12, 0));
      along.add(pour, at(cyl(k, 0.035, 0.028, 0.1, m.glass, 8), L * 0.15 + 0.14, 1.1, front));
      const stools = Math.max(1, Math.floor(L / 0.7));
      for (let i = 0; i < stools; i++) {
        const x = -L / 2 + (i + 0.5) * (L / stools);
        const z = D / 2 + 0.32;
        along.add(at(cyl(k, 0.18, 0.17, 0.07, m.leather, 16), x, 0.76, z), at(cyl(k, 0.025, 0.025, 0.72, m.steel, 6), x, 0.38, z), at(cyl(k, 0.2, 0.22, 0.03, m.steel, 16), x, 0.015, z));
      }
      const lamps: THREE.Mesh[] = [];
      const nl = Math.max(2, Math.floor(L / 1.2));
      for (let i = 0; i < nl; i++) {
        const x = -L / 2 + (i + 0.5) * (L / nl);
        along.add(at(cyl(k, 0.004, 0.004, 0.7, m.rope, 4), x, 2.25, front));
        const shade = dynamic(at(new THREE.Mesh(k.geo('lamp', () => new THREE.SphereGeometry(0.09, 12, 8)), m.warm), x, 1.85, front));
        lamps.push(shade);
        along.add(shade);
      }
      const tender = person(k, seed, { outfit: '#1F2937', apron: true });
      tender.position.set(0, 0, (backZ + front) / 2 - 0.05);
      along.add(tender);
      if (k.motion) {
        const { arm } = tender.userData.parts as { arm: THREE.Mesh };
        k.anims.push((t) => {
          tender.position.x = Math.sin(t * 0.3) * (L / 2 - 0.5);
          arm.rotation.x = -1.6 + Math.sin(t * 14) * 0.35; // shaking a cocktail
          const p = (t % 6) / 6;
          pour.rotation.z = p > 0.6 && p < 0.9 ? Math.sin(((p - 0.6) / 0.3) * Math.PI) * 1.6 : 0;
          (m.backlight as THREE.MeshStandardMaterial).emissive.setHSL((0.08 + Math.sin(t * 0.2) * 0.05 + 1) % 1, 0.9, 0.5);
          (m.led as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.05) % 1, 0.8, 0.55);
          (m.warm as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 2) * 0.2;
        });
      }
      if (d > w) along.rotation.y = Math.PI / 2;
      g.add(along);
      return { group: g, labelY: 2.4 };
    }
    case 'KITCHEN': {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.tiles);
      ((m.tiles as THREE.MeshStandardMaterial).map as THREE.Texture).repeat.set(w / 0.6, d / 0.6);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.004;
      g.add(floor);
      const backZ = -d / 2 + 0.35;
      g.add(at(box(k, w - 0.2, 0.9, 0.6, m.steel), 0, 0.45, backZ));
      const stoveW = Math.min(1.2, w * 0.4);
      const sx = w * 0.1;
      g.add(at(box(k, stoveW, 0.92, 0.64, m.black), sx, 0.46, backZ));
      const flames: THREE.Mesh[] = [];
      const steams: THREE.Mesh[] = [];
      [[-0.25, -0.13], [0.25, -0.13], [-0.25, 0.15], [0.25, 0.15]].forEach(([bx, bz], i) => {
        const x = sx + bx! * (stoveW / 1.2);
        const f = dynamic(at(new THREE.Mesh(k.geo('burner', () => new THREE.TorusGeometry(0.07, 0.014, 6, 16)), m.burner), x, 0.93, backZ + bz!));
        f.rotation.x = Math.PI / 2;
        flames.push(f);
        // Pots and pans with handles.
        if (i % 2 === 0) g.add(at(cyl(k, 0.12, 0.1, 0.16, m.steel, 16), x, 1.01, backZ + bz!), at(box(k, 0.2, 0.02, 0.03, m.black), x + 0.2, 1.06, backZ + bz!));
        else g.add(at(cyl(k, 0.13, 0.11, 0.05, m.black, 16), x, 0.96, backZ + bz!), at(box(k, 0.22, 0.02, 0.03, m.black), x - 0.22, 0.97, backZ + bz!));
        for (let j = 0; j < 3; j++) {
          const puff = dynamic(at(new THREE.Mesh(k.geo('puff', () => new THREE.SphereGeometry(0.05, 8, 6)), m.steam.clone()), x, 1.15, backZ + bz!));
          puff.userData.phase = j / 3 + i * 0.17;
          steams.push(puff);
        }
        g.add(f);
      });
      g.add(...steams);
      const hood = at(new THREE.Mesh(k.geo(`hood${r2(stoveW)}`, () => new THREE.CylinderGeometry(0.18, stoveW * 0.62, 0.5, 4)), m.steel), sx, 2.05, backZ);
      hood.rotation.y = Math.PI / 4;
      g.add(hood, at(box(k, 0.25, 0.6, 0.25, m.steel), sx, 2.55, backZ));
      g.add(at(box(k, 0.8, 2.0, 0.7, m.steel), -w / 2 + 0.5, 1.0, backZ), at(box(k, 0.03, 0.6, 0.04, m.black), -w / 2 + 0.78, 1.2, backZ + 0.37));
      // Cutting board with vegetables, and a utensil rail.
      g.add(at(box(k, 0.4, 0.03, 0.28, m.wood), -w * 0.15, 0.915, backZ));
      for (let i = 0; i < 5; i++) g.add(at(new THREE.Mesh(k.geo('veg', () => new THREE.SphereGeometry(0.035, 8, 6)), m.food[i % m.food.length]!), -w * 0.15 - 0.12 + i * 0.06, 0.95, backZ + (i % 2) * 0.06));
      g.add(at(box(k, Math.min(1.4, w * 0.5), 0.02, 0.02, m.steel), -w * 0.15, 1.7, backZ - 0.28));
      for (let i = 0; i < 5; i++) g.add(at(box(k, 0.03, 0.3, 0.01, m.metal), -w * 0.15 - 0.3 + i * 0.15, 1.55, backZ - 0.28));
      const passZ = d / 2 - 0.25;
      g.add(at(box(k, w - 0.2, 1.0, 0.4, m.steel), 0, 0.5, passZ));
      const nh = Math.max(2, Math.floor(w / 1.2));
      for (let i = 0; i < nh; i++) {
        const x = -w / 2 + 0.4 + i * ((w - 0.8) / Math.max(1, nh - 1));
        g.add(at(cyl(k, 0.004, 0.004, 0.6, m.rope, 4), x, 1.75, passZ), at(new THREE.Mesh(k.geo('heat', () => new THREE.ConeGeometry(0.1, 0.14, 12, 1, true)), m.heat), x, 1.42, passZ), at(cyl(k, 0.11, 0.09, 0.02, m.plate, 16), x, 1.01, passZ));
      }
      for (const s of [-1, 1]) g.add(at(box(k, 0.08, 1.2, d, m.wall), s * (w / 2 - 0.04), 0.6, 0));
      const chef = person(k, seed, { outfit: '#F8FAFC', hat: true, apron: true });
      chef.position.set(sx, 0, backZ + 0.55);
      chef.rotation.y = Math.PI;
      g.add(chef);
      if (k.motion) {
        const { arm, head } = chef.userData.parts as { arm: THREE.Mesh; head: THREE.Mesh };
        k.anims.push((t) => {
          // Cook between the stove and the board, stirring while at the stove.
          const c = (Math.sin(t * 0.35) + 1) / 2;
          chef.position.x = sx + (-w * 0.15 - sx) * (c > 0.8 ? (c - 0.8) * 5 : 0);
          arm.rotation.x = -1.1 + Math.sin(t * 6) * 0.25;
          arm.rotation.z = Math.cos(t * 6) * 0.25;
          head.rotation.x = 0.25;
          flames.forEach((f, i) => f.scale.setScalar(1 + Math.sin(t * 11 + i * 2) * 0.12));
          (m.burner as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.4;
          for (const p of steams) {
            const ph = ((t * 0.5 + (p.userData.phase as number)) % 1);
            p.position.y = 1.12 + ph * 0.6;
            p.scale.setScalar(0.6 + ph * 1.4);
            (p.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - ph);
          }
        });
      }
      return { group: g, labelY: 2.9 };
    }
    case 'RESTROOM': {
      g.add(at(box(k, w, 2.2, d, m.wall), 0, 1.1, 0), at(box(k, w + 0.04, 0.06, d + 0.04, m.wood), 0, 2.23, 0));
      g.add(at(box(k, Math.min(0.85, w * 0.6), 2.0, 0.04, m.wood), 0, 1.0, d / 2 + 0.02), at(cyl(k, 0.02, 0.02, 0.12, m.steel, 6), Math.min(0.3, w * 0.2), 1.0, d / 2 + 0.07));
      g.add(at(box(k, 0.5, 0.24, 0.02, m.white), 0, 2.1, d / 2 + 0.03));
      for (const [s, c] of [[-1, '#2563EB'], [1, '#DB2777']] as const) {
        const mat = k.mat(`sign${c}`, () => std(c));
        g.add(at(new THREE.Mesh(k.geo('signhead', () => new THREE.SphereGeometry(0.025, 8, 6)), mat), s * 0.1, 2.17, d / 2 + 0.045), at(box(k, 0.04, 0.09, 0.01, mat), s * 0.1, 2.09, d / 2 + 0.045));
      }
      return { group: g, labelY: 2.6 };
    }
    case 'ENTRANCE':
    case 'DOOR': {
      const thick = Math.max(d, 0.14);
      const double = o.kind === 'ENTRANCE';
      const frame = k.mat('doorframe', () => std('#3B2A1E', { roughness: 0.5 }));
      for (const s of [-1, 1]) g.add(at(box(k, 0.12, 2.35, thick, frame), s * (w / 2 - 0.06), 1.175, 0));
      g.add(at(box(k, w, 0.18, thick, frame), 0, 2.35, 0));
      const leaves: THREE.Group[] = [];
      const panels = double ? 2 : 1;
      const pw = (w - 0.12) / panels;
      for (let i = 0; i < panels; i++) {
        const hinge = dynamic(new THREE.Group());
        const side = panels === 2 ? (i === 0 ? -1 : 1) : -1;
        hinge.position.set(side * (w / 2 - 0.06), 0, 0);
        // A real door leaf: wooden rails and stiles around a glass pane, with a brass handle.
        const cx = -side * pw / 2;
        hinge.add(at(box(k, pw, 0.16, 0.05, m.wood), cx, 0.1, 0), at(box(k, pw, 0.14, 0.05, m.wood), cx, 2.13, 0));
        hinge.add(at(box(k, 0.1, 2.2, 0.05, m.wood), cx - side * (pw / 2 - 0.05), 1.1, 0), at(box(k, 0.1, 2.2, 0.05, m.wood), cx + side * (pw / 2 - 0.05), 1.1, 0));
        hinge.add(at(box(k, pw - 0.2, 1.85, 0.02, double ? m.glass : m.wood), cx, 1.13, 0));
        const brass = k.mat('brass', () => std('#C9A227', { metalness: 0.8, roughness: 0.3 }));
        hinge.add(at(cyl(k, 0.016, 0.016, 0.5, brass, 8), -side * (pw - 0.1), 1.05, 0.05), at(cyl(k, 0.016, 0.016, 0.5, brass, 8), -side * (pw - 0.1), 1.05, -0.05));
        leaves.push(hinge);
        g.add(hinge);
      }
      let guest: THREE.Group | null = null;
      if (double) {
        g.add(at(box(k, 0.6, 0.16, 0.04, m.exit), 0, 2.62, 0), at(box(k, Math.min(w, 1.8), 0.012, 0.9, m.mat), 0, 0.006, -0.55));
        for (const s of [-1, 1]) g.add(at(cyl(k, 0.18, 0.14, 0.4, m.terracotta, 12), s * (w / 2 + 0.3), 0.2, 0.3));
        guest = person(k, seed + 3, {});
        guest.visible = false;
        g.add(guest);
      }
      const swing = double ? 1.25 : 0.55;
      if (k.motion) {
        const parts = guest?.userData.parts as { torso: THREE.Mesh } | undefined;
        k.anims.push((t) => {
          // Doors open, a guest walks in, doors close.
          const c = (t % 9) / 9;
          const open = c < 0.12 ? c / 0.12 : c < 0.55 ? 1 : c < 0.67 ? 1 - (c - 0.55) / 0.12 : 0;
          const e = open * open * (3 - 2 * open);
          leaves.forEach((l, i) => { l.rotation.y = (panels === 2 ? (i === 0 ? 1 : -1) : 1) * e * swing; });
          if (guest) {
            const walk = (c - 0.1) / 0.45;
            guest.visible = walk > 0 && walk < 1;
            guest.position.set(0, Math.abs(Math.sin(walk * 18)) * 0.03, 1.6 - walk * 3.2);
            guest.rotation.y = Math.PI;
            if (parts) parts.torso.rotation.z = Math.sin(walk * 18) * 0.04;
          }
        });
      } else leaves.forEach((l, i) => { l.rotation.y = (panels === 2 ? (i === 0 ? 1 : -1) : 1) * swing * 0.6; });
      return { group: g, labelY: 3.0 };
    }
    case 'WINDOW': {
      const L = Math.max(w, d);
      const along = new THREE.Group();
      along.add(at(box(k, L, 0.05, 0.22, m.white), 0, 0.88, 0), at(box(k, L - 0.06, 1.35, 0.03, m.glass), 0, 1.6, 0), at(box(k, L, 0.06, 0.08, m.white), 0, 2.3, 0));
      const mullions = Math.max(1, Math.round(L / 0.8));
      for (let i = 0; i <= mullions; i++) along.add(at(box(k, 0.05, 1.42, 0.07, m.white), -L / 2 + (i * L) / mullions, 1.6, 0));
      along.add(at(box(k, L, 0.04, 0.06, m.white), 0, 1.6, 0));
      if (d > w) along.rotation.y = Math.PI / 2;
      g.add(along);
      return { group: g, labelY: 2.6 };
    }
    case 'PLANT': {
      const r = Math.min(w, d) / 2;
      g.add(at(cyl(k, r * 0.75, r * 0.55, 0.45, m.terracotta, 14), 0, 0.225, 0), at(cyl(k, r * 0.7, r * 0.7, 0.02, m.soil, 14), 0, 0.44, 0));
      const crown = dynamic(new THREE.Group());
      crown.position.y = 0.45;
      crown.add(at(cyl(k, 0.025, 0.035, 0.6, m.woodDark, 6), 0, 0.3, 0));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + seed;
        crown.add(at(new THREE.Mesh(k.geo(`leaf${r2(r)}${i % 3}`, () => new THREE.IcosahedronGeometry(r * (0.45 + (i % 3) * 0.12), 0)), m.leaves[i % m.leaves.length]!), Math.cos(a) * r * 0.45, 0.55 + (i % 3) * 0.18, Math.sin(a) * r * 0.45));
      }
      g.add(crown);
      if (k.motion) {
        const ph = (seed % 60) / 9;
        k.anims.push((t) => { crown.rotation.z = Math.sin(t * 1.1 + ph) * 0.05; crown.rotation.x = Math.sin(t * 0.8 + ph) * 0.04; });
      }
      return { group: g, labelY: 1.7 };
    }
    case 'PILLAR': {
      const r = Math.min(w, d) / 2;
      g.add(at(box(k, r * 2.4, 0.12, r * 2.4, m.marble), 0, 0.06, 0), at(cyl(k, r, r, 2.6, m.marble, 20), 0, 1.42, 0), at(box(k, r * 2.4, 0.12, r * 2.4, m.marble), 0, 2.78, 0));
      return { group: g, labelY: 3.1 };
    }
    case 'STAGE': {
      g.add(at(box(k, w, 0.4, d, m.woodDark), 0, 0.2, 0));
      const strip = dynamic(at(box(k, w, 0.04, 0.02, m.led), 0, 0.36, d / 2 + 0.01));
      g.add(strip, at(box(k, Math.min(1.2, w / 3), 0.2, 0.35, m.woodDark), 0, 0.1, d / 2 + 0.17));
      g.add(at(cyl(k, 0.012, 0.012, 1.4, m.black, 6), 0, 1.1, d / 4), at(new THREE.Mesh(k.geo('mic', () => new THREE.SphereGeometry(0.04, 8, 6)), m.metal), 0, 1.82, d / 4));
      for (const s of [-1, 1]) g.add(at(box(k, 0.4, 0.9, 0.35, m.black), s * (w / 2 - 0.3), 0.85, d / 4));
      g.add(at(box(k, w, 0.08, 0.08, m.black), 0, 3.0, -d / 4));
      const beams: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const x = -w / 3 + (i * w) / 3;
        const beam = dynamic(at(new THREE.Mesh(k.geo('beam', () => new THREE.ConeGeometry(0.6, 2.6, 16, 1, true)), m.beam.clone()), x, 1.7, 0));
        beams.push(beam);
        g.add(at(cyl(k, 0.08, 0.1, 0.2, m.black, 10), x, 2.9, -d / 4), beam);
      }
      const singer = person(k, seed, { outfit: '#9333EA' });
      singer.position.set(0, 0.4, d / 4 - 0.25);
      g.add(singer);
      if (k.motion) {
        const { arm } = singer.userData.parts as { arm: THREE.Mesh };
        k.anims.push((t) => {
          beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.8 + i * 2) * 0.35; (b.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.08 + i * 0.3) % 1, 0.9, 0.7); });
          (m.led as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.12) % 1, 0.9, 0.55);
          singer.rotation.z = Math.sin(t * 2.2) * 0.06;
          arm.rotation.x = -1.4 + Math.sin(t * 2.2) * 0.2;
        });
      }
      return { group: g, labelY: 3.3 };
    }
    case 'SCREEN':
    case 'TV': {
      const tv = o.kind === 'TV';
      const L = Math.max(w, d);
      const along = new THREE.Group();
      const sw = tv ? L * 0.9 : L;
      const sh = Math.min(sw * 0.56, tv ? 1.0 : 2.2);
      const base = tv ? 0.62 : 1.1;
      if (tv) along.add(at(box(k, L, 0.5, Math.max(Math.min(w, d), 0.4), m.wood), 0, 0.25, 0), at(box(k, 0.25, 0.1, 0.18, m.black), 0, 0.55, 0));
      else for (const s of [-1, 1]) along.add(at(cyl(k, 0.03, 0.03, base, m.black, 6), s * (sw / 2 - 0.2), base / 2, 0));
      along.add(at(box(k, sw, sh, 0.07, m.black), 0, base + sh / 2, 0));
      // Live cricket on both faces of the screen.
      for (const s of [-1, 1]) {
        const show = cricketScreen(k, sw - 0.08, sh - 0.08);
        show.position.set(0, base + sh / 2, s * 0.037);
        if (s < 0) show.rotation.y = Math.PI;
        along.add(show);
      }
      if (d > w) along.rotation.y = Math.PI / 2;
      g.add(along);
      return { group: g, labelY: base + sh + 0.4 };
    }
    case 'WALL': {
      g.add(at(box(k, w, 2.4, d, m.wall), 0, 1.2, 0), at(box(k, w + 0.01, 0.1, d + 0.01, m.woodDark), 0, 0.05, 0));
      return { group: g, labelY: 2.7 };
    }
    default: {
      g.add(at(box(k, w, 0.9, d, m.wood), 0, 0.45, 0), at(box(k, w + 0.04, 0.04, d + 0.04, m.marble), 0, 0.92, 0));
      return { group: g, labelY: 1.3 };
    }
  }
}

/**
 * Merges every non-moving mesh into one mesh per material (a few draw calls for the whole room).
 * Moving parts (flagged `dynamic` on themselves or an ancestor) are left as they are.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  const isDynamic = (o: THREE.Object3D | null): boolean => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true; return false; };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || isDynamic(mesh)) return;
    // Transparent and unlit parts stay separate (correct sorting; they are few).
    const mm = mesh.material as THREE.Material & { transparent?: boolean };
    if (mm.transparent || mm instanceof THREE.MeshBasicMaterial) return;
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position!.count * 2), 2));
    const list = buckets.get(mesh.material as THREE.Material) ?? [];
    list.push(geo);
    buckets.set(mesh.material as THREE.Material, list);
    remove.push(mesh);
  });
  for (const mesh of remove) {
    mesh.parent?.remove(mesh);
    if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
  }
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const out = new THREE.Mesh(merged, mat);
    const transparent = (mat as THREE.Material & { transparent?: boolean }).transparent || mat instanceof THREE.MeshBasicMaterial;
    out.castShadow = !transparent;
    out.receiveShadow = !transparent;
    root.add(out);
  }
}

/** Free GPU memory for everything under a node (geometries, materials, textures). */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) { seen.add(mesh.geometry); mesh.geometry.dispose(); }
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map && !seen.has(map)) { seen.add(map); map.dispose(); }
      mat.dispose();
    }
  });
}
