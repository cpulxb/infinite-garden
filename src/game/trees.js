// 树：浇水后生长，结出与树同色的方块果实。整棵树由轴对齐的盒子分形生成
import { DIRS, opp, axisOf, signOf, rng, hexToRgb, lateralDirs } from '../core/math.js';
import { GRAV_HEX } from './constants.js';

// 局部坐标（y 为“上”）→ 世界坐标的轴映射
function frameFor(color) {
  const up = opp(color);
  const ua = axisOf(up), us = signOf(up);
  const others = [0, 1, 2].filter((a) => a !== ua);
  // 局部 x → others[0]，局部 z → others[1]
  return { ua, us, xa: others[0], za: others[1] };
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const to255 = (c) => [Math.round(Math.min(1, c[0]) * 255), Math.round(Math.min(1, c[1]) * 255), Math.round(Math.min(1, c[2]) * 255)];

export function generateTree(def) {
  const r = rng(def.seed + 17);
  const parts = [];
  const spots = [];
  const sc = def.scale || 1;
  const leafBase = def.hue ? hexToRgb(def.hue) : hexToRgb(GRAV_HEX[def.color]);
  const bark = [0.42, 0.36, 0.33];
  const LAT = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

  function branch(o, dir, len, th, depth, t0) {
    const end = [o[0] + dir[0] * len, o[1] + dir[1] * len, o[2] + dir[2] * len];
    const mn = [Math.min(o[0], end[0]) - th, Math.min(o[1], end[1]) - th, Math.min(o[2], end[2]) - th];
    const mx = [Math.max(o[0], end[0]) + th, Math.max(o[1], end[1]) + th, Math.max(o[2], end[2]) + th];
    const t1 = t0 + 0.12 + len * 0.05;
    parts.push({ mn, mx, pivot: o.slice(), t0, t1, kind: 'bark', color: to255(mix(bark, [0.6, 0.55, 0.5], r() * 0.3)) });
    if (depth <= 0 || len < 0.5) {
      // 叶团
      const n = 4 + Math.floor(r() * 4);
      const cc = end;
      const lt0 = t1 - 0.05;
      for (let i = 0; i < n; i++) {
        const s = (0.35 + r() * 0.45) * sc;
        const off = i === 0 ? [0, 0.15, 0] : [(r() - 0.5) * 1.3 * sc, (r() - 0.3) * 0.9 * sc, (r() - 0.5) * 1.3 * sc];
        const c = [cc[0] + off[0], cc[1] + off[1], cc[2] + off[2]];
        const shade = 0.82 + r() * 0.3;
        const col = mix(leafBase.map((v) => v * shade), [1, 1, 1], 0.12 + r() * 0.22);
        parts.push({ mn: [c[0] - s, c[1] - s, c[2] - s], mx: [c[0] + s, c[1] + s, c[2] + s], pivot: c, t0: lt0 + r() * 0.08, t1: lt0 + 0.22 + r() * 0.1, kind: 'leaf', color: to255(col) });
      }
      spots.push([cc[0], cc[1] - 0.9 * sc, cc[2]]);
      return;
    }
    const kids = [];
    if (dir[1] > 0) {
      // 主干向上：分出 2~3 个侧枝和一个向上的延续
      const lat = LAT.slice().sort(() => r() - 0.5);
      const nk = 2 + Math.floor(r() * 2);
      for (let i = 0; i < nk; i++) kids.push(lat[i]);
      if (r() < 0.75) kids.push([0, 1, 0]);
    } else {
      kids.push([0, 1, 0]);
      if (r() < 0.6) kids.push(dir);
    }
    for (const k of kids) {
      const l = (k[1] > 0 ? len * (0.55 + r() * 0.25) : len * (0.5 + r() * 0.3)) + 0.25;
      branch(end, k, l, th * 0.72, depth - 1, t1 - 0.04);
    }
  }
  const trunkLen = (2.2 + r() * 1.0) * sc;
  branch([0, 0, 0], [0, 1, 0], trunkLen, 0.17 * sc, def.depth ?? 3, 0);
  // 归一化生长时间
  let tmax = 0;
  for (const p of parts) tmax = Math.max(tmax, p.t1);
  for (const p of parts) { p.t0 /= tmax; p.t1 /= tmax; }
  return { parts, spots };
}

export class TreeSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  load(level) {
    this.list = level.trees.map((def) => {
      const gen = generateTree(def);
      const f = frameFor(def.color);
      const base = [def.cell[0] + 0.5, def.cell[1] + 0.5, def.cell[2] + 0.5];
      // 树根位于格子底面（重力方向一侧）
      base[f.ua] = def.cell[f.ua] + (f.us > 0 ? 0 : 1);
      const toWorld = (p) => {
        const w = base.slice();
        w[f.ua] += p[1] * f.us;
        w[f.xa] += p[0];
        w[f.za] += p[2];
        return w;
      };
      const parts = gen.parts.map((p) => {
        const a = toWorld(p.mn), b = toWorld(p.mx);
        return {
          mn: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
          mx: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
          pivot: toWorld(p.pivot), t0: p.t0, t1: p.t1, kind: p.kind, color: p.color,
        };
      });
      // 浇水判定：树根格及其侧邻、地下一格
      const c = def.cell;
      const D = DIRS[def.color];
      const soil = [c[0] + D[0], c[1] + D[1], c[2] + D[2]];
      const rootCells = [c.slice()];
      for (const d of lateralDirs(def.color)) {
        const n = DIRS[d];
        rootCells.push([c[0] + n[0], c[1] + n[1], c[2] + n[2]]);
        rootCells.push([soil[0] + n[0], soil[1] + n[1], soil[2] + n[2]]);
      }
      const spots = gen.spots.map(toWorld);
      const leaf = hexToRgb(def.hue || GRAV_HEX[def.color]);
      const sapling = [
        { mn: toWorld([-0.07, 0, -0.07]), mx: toWorld([0.07, 0.85, 0.07]), c: [96, 82, 74], fx: 8, e: 0 },
        { mn: toWorld([-0.24, 0.7, -0.24]), mx: toWorld([0.2, 1.1, 0.2]), c: to255(leaf.map((v) => v * 0.95)), fx: 7, e: 0 },
        { mn: toWorld([0.02, 0.88, -0.05]), mx: toWorld([0.32, 1.16, 0.25]), c: to255(mix(leaf, [1, 1, 1], 0.25)), fx: 7, e: 0 },
        { mn: toWorld([-0.3, 0.92, 0.0]), mx: toWorld([-0.06, 1.16, 0.24]), c: to255(mix(leaf, [1, 1, 1], 0.15)), fx: 7, e: 0 },
        { mn: toWorld([-0.06, 1.12, -0.06]), mx: toWorld([0.06, 1.24, 0.06]), c: to255(mix(leaf, [1, 1, 1], 0.5)), fx: 10, e: 200 },
      ].map((b) => ({ ...b, mn: [Math.min(b.mn[0], b.mx[0]), Math.min(b.mn[1], b.mx[1]), Math.min(b.mn[2], b.mx[2])], mx: [Math.max(b.mn[0], b.mx[0]), Math.max(b.mn[1], b.mx[1]), Math.max(b.mn[2], b.mx[2])] }));
      return {
        def, parts, spots, rootCells, sapling,
        grown: def.deco ? 1 : 0,
        state: def.deco ? 'deco' : 'sapling',
        sway: Math.random() * 10,
        fruitsSpawned: false,
      };
    });
  }

  water(tr) {
    if (tr.state !== 'sapling') return;
    tr.state = 'growing';
    this.game.audio.treeGrow(this.game.relToCam(tr.parts[0].pivot));
    this.game.onTreeWatered(tr);
  }

  update(dt) {
    for (const tr of this.list) {
      tr.sway += dt;
      if (tr.state === 'growing') {
        tr.grown = Math.min(1, tr.grown + dt / 4.5);
        if (tr.grown >= 1) {
          tr.state = 'grown';
          this.spawnFruit(tr);
        }
      }
    }
  }

  // 果实只生成在“下方有地面”的位置，避免掉进虚空
  spawnFruit(tr) {
    const g = this.game;
    const n = tr.def.fruits;
    if (!n || tr.fruitsSpawned) return;
    tr.fruitsSpawned = true;
    const D = DIRS[tr.def.color];
    const up = DIRS[opp(tr.def.color)];
    const base = tr.parts[0].pivot;
    const cands = tr.spots.map((s) => s.slice());
    // 树干周围的备选位置
    for (const d of lateralDirs(tr.def.color)) {
      const L = DIRS[d];
      for (const r of [1.2, 2.2]) cands.push([0, 1, 2].map((a) => base[a] + L[a] * r + up[a] * 2.2));
    }
    const ok = [];
    for (const s of cands) {
      const p = s.map((v) => Math.floor(v) + 0.5);
      const box = [p[0] - 0.42, p[1] - 0.42, p[2] - 0.42, p[0] + 0.42, p[1] + 0.42, p[2] + 0.42];
      if (g.boxBlocked(box, null)) continue;
      const h = g.world.raycast(p, D, 9);
      if (!h) continue;
      if (ok.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.9)) continue;
      ok.push(p);
    }
    // 优先选择离树干近的位置
    ok.sort((a, b) => Math.hypot(a[0] - base[0], a[2] - base[2], a[1] - base[1]) - Math.hypot(b[0] - base[0], b[2] - base[2], b[1] - base[1]));
    for (let i = 0; i < Math.min(n, ok.length); i++) g.cubes.add(tr.def.color, ok[i], { appear: 0, fruit: true });
    g.audio.fruit(g.relToCam(base));
  }

  build(batch, time) {
    for (const tr of this.list) {
      const gr = tr.grown;
      if (tr.state === 'sapling') {
        for (const b of tr.sapling) batch.box(b.mn[0], b.mn[1], b.mn[2], b.mx[0], b.mx[1], b.mx[2], b.c, b.e, b.fx, b.fx === 8 ? 241 : 240);
        continue;
      }
      for (const p of tr.parts) {
        let s = (gr - p.t0) / Math.max(1e-3, p.t1 - p.t0);
        if (s <= 0) continue;
        s = Math.min(1, s);
        const e = 1 - Math.pow(1 - s, 3);
        const pv = p.pivot;
        let mn = p.mn, mx = p.mx;
        if (e < 1) {
          mn = [pv[0] + (p.mn[0] - pv[0]) * e, pv[1] + (p.mn[1] - pv[1]) * e, pv[2] + (p.mn[2] - pv[2]) * e];
          mx = [pv[0] + (p.mx[0] - pv[0]) * e, pv[1] + (p.mx[1] - pv[1]) * e, pv[2] + (p.mx[2] - pv[2]) * e];
        }
        if (p.kind === 'leaf') {
          const w = Math.sin(time * 1.1 + pv[0] * 0.7 + pv[2] * 0.5 + tr.sway * 0) * 0.025;
          mn = [mn[0] + w, mn[1], mn[2] + w];
          mx = [mx[0] + w, mx[1], mx[2] + w];
          batch.box(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], p.color, 0, 7, 240);
        } else {
          batch.box(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], p.color, 0, 8, 241);
        }
      }
    }
  }
}
