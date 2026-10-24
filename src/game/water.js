// 水：在体素网格上按重力流动。遇空则坠落，遇阻则沿表面铺开并寻找最近的落差
import { DIRS, axisOf, signOf, lateralDirs, mod, wrapDelta } from '../core/math.js';

const TICK = 0.05;
const MAX_LEVEL = 8;

export class Water {
  constructor(game) {
    this.game = game;
    this.present = new Map();
    this.target = new Map();
    this.sources = [];
  }

  load(level) {
    this.sources = level.sources.map((s) => ({ ...s }));
    this.present.clear();
    this.target.clear();
    this.timer = 0;
    this.sig = null;
    this.blockSet = new Set();
    this.nearest = 99;
    this.changed = true;
  }

  blocked(x, y, z) {
    const w = this.game.world;
    if (w.isSolid(x, y, z)) return true;
    return this.blockSet.has(w.idx(x, y, z));
  }

  dropDist(x, y, z, g, maxD) {
    const D = DIRS[g];
    const lat = lateralDirs(g);
    const w = this.game.world;
    const seen = new Set([w.idx(x, y, z)]);
    let front = [[x, y, z]];
    for (let dist = 0; dist <= maxD; dist++) {
      const next = [];
      for (const [cx, cy, cz] of front) {
        if (!this.blocked(cx + D[0], cy + D[1], cz + D[2])) return dist;
        if (dist === maxD) continue;
        for (const d of lat) {
          const n = DIRS[d];
          const nx = cx + n[0], ny = cy + n[1], nz = cz + n[2];
          const k = w.idx(nx, ny, nz);
          if (seen.has(k) || this.blocked(nx, ny, nz)) continue;
          seen.add(k);
          next.push([nx, ny, nz]);
        }
      }
      front = next;
      if (!front.length) break;
    }
    return 99;
  }

  compute() {
    const w = this.game.world;
    const [sx, sy, sz] = w.size;
    const T = new Map();
    const q = [];
    for (const s of this.sources) q.push([s.cell[0], s.cell[1], s.cell[2], MAX_LEVEL, 'src', s.grav, s.grav, -1, -1]);
    let head = 0, guard = 0;
    while (head < q.length && guard++ < 40000) {
      const [x0, y0, z0, lvl, entry, g, flow, parent, spill] = q[head++];
      const x = mod(x0, sx), y = mod(y0, sy), z = mod(z0, sz);
      const k = w.idx(x, y, z);
      const ex = T.get(k);
      if (ex && ex.level >= lvl) continue;
      if (entry !== 'src' && this.blocked(x, y, z)) continue;
      const D = DIRS[g];
      const belowOpen = !this.blocked(x + D[0], y + D[1], z + D[2]);
      // gp：首次抵达该格时的来源，用于逐格生长（闭环瀑布中 parent 可能首尾相接）
      const e = { x, y, z, level: lvl, entry, g, flow, parent, gp: ex ? ex.gp : parent, falling: belowOpen, spill };
      T.set(k, e);
      if (belowOpen) {
        q.push([x + D[0], y + D[1], z + D[2], MAX_LEVEL, 'top', g, g, k, entry === 'side' ? flow : spill]);
        continue;
      }
      if (lvl <= 1) continue;
      const lat = lateralDirs(g);
      const open = [];
      for (const d of lat) {
        const n = DIRS[d];
        if (!this.blocked(x + n[0], y + n[1], z + n[2])) open.push(d);
      }
      if (!open.length) continue;
      let best = 99;
      const dist = {};
      for (const d of open) {
        const n = DIRS[d];
        const dd = this.dropDist(x + n[0], y + n[1], z + n[2], g, 6);
        dist[d] = dd;
        if (dd < best) best = dd;
      }
      const chosen = best < 99 ? open.filter((d) => dist[d] === best) : open;
      for (const d of chosen) {
        const n = DIRS[d];
        q.push([x + n[0], y + n[1], z + n[2], lvl - 1, 'side', g, d, k, -1]);
      }
    }
    return T;
  }

  signature() {
    const g = this.game;
    const set = new Set();
    for (const c of g.cubes.list) {
      if (c.state === 'held') continue;
      set.add(g.world.idx(Math.floor(c.pos[0]), Math.floor(c.pos[1]), Math.floor(c.pos[2])));
    }
    for (const d of g.mech.doors) {
      const b = d.box();
      for (let z = Math.floor(b[2] + 0.05); z < Math.ceil(b[5] - 0.05); z++)
        for (let y = Math.floor(b[1] + 0.05); y < Math.ceil(b[4] - 0.05); y++)
          for (let x = Math.floor(b[0] + 0.05); x < Math.ceil(b[3] - 0.05); x++) set.add(g.world.idx(x, y, z));
    }
    this.blockSet = set;
    return [...set].sort((a, b) => a - b).join(',');
  }

  tick() {
    const sig = this.signature();
    if (sig !== this.sig) {
      this.sig = sig;
      this.target = this.compute();
    }
    const add = [];
    for (const [k, t] of this.target) {
      const p = this.present.get(k);
      if (p) {
        p.dying = false;
        Object.assign(p, { level: t.level, entry: t.entry, flow: t.flow, falling: t.falling, parent: t.parent, spill: t.spill, g: t.g });
      } else if (t.entry === 'src') add.push(k);
      else {
        const par = this.present.get(t.gp);
        if (par && !par.dying && par.fill > 0.5) add.push(k);
      }
    }
    for (const k of add) this.present.set(k, { ...this.target.get(k), fill: 0, dying: false });
    for (const [k, p] of this.present) if (!this.target.has(k)) p.dying = true;
    this.changed = true;

    // 触发：树木与水池
    const g = this.game;
    for (const tr of g.trees.list) {
      if (tr.def.deco || tr.state !== 'sapling') continue;
      if (this.touches(tr.rootCells)) g.trees.water(tr);
    }
    for (const b of g.mech.basins) {
      const p = this.present.get(g.world.idx(b.cell[0], b.cell[1], b.cell[2]));
      b.active = !!(p && !p.dying && p.fill > 0.6);
    }
    // 与玩家的最近距离（用于水声）
    let best = 99;
    const eye = g.player.eye();
    let n = 0;
    for (const p of this.present.values()) {
      if (p.dying) continue;
      if (++n > 900) break;
      const d = wrapDelta(eye, [p.x + 0.5, p.y + 0.5, p.z + 0.5], g.size);
      const l = Math.hypot(d[0], d[1], d[2]);
      if (l < best) best = l;
    }
    this.nearest = best;
  }

  touches(cells) {
    const w = this.game.world;
    for (const c of cells) {
      const p = this.present.get(w.idx(c[0], c[1], c[2]));
      if (p && !p.dying && p.fill > 0.5) return true;
    }
    return false;
  }

  update(dt) {
    this.timer += dt;
    let n = 0;
    while (this.timer >= TICK && n++ < 4) { this.timer -= TICK; this.tick(); }
    if (this.timer > TICK) this.timer = 0;
    const rate = dt / 0.1;
    for (const [k, p] of this.present) {
      if (p.dying) {
        p.fill -= rate * 0.7;
        if (p.fill <= 0) this.present.delete(k);
      } else p.fill = Math.min(1, p.fill + rate);
    }
  }

  // 生成水的半透明几何
  build(batch) {
    const w = this.game.world;
    const P = this.present;
    for (const p of P.values()) {
      if (p.fill <= 0.01) continue;
      const g = p.g, ga = axisOf(g), gs = signOf(g);
      const lat = lateralDirs(g);
      const base = [p.x, p.y, p.z];
      const mn = [p.x, p.y, p.z], mx = [p.x + 1, p.y + 1, p.z + 1];
      const thick = (0.1 + 0.12 * (p.level / MAX_LEVEL)) * Math.min(1, p.fill * 1.4);
      // 贴地一侧（重力方向一侧）
      const floorSide = gs > 0 ? 'max' : 'min';
      if (!p.falling) {
        if (floorSide === 'min') mx[ga] = mn[ga] + thick; else mn[ga] = mx[ga] - thick;
        let faces = 0;
        const top = g ^ 1;
        faces |= 1 << top;
        for (const d of lat) {
          const n = DIRS[d];
          const nx = p.x + n[0], ny = p.y + n[1], nz = p.z + n[2];
          const q = P.get(w.idx(nx, ny, nz));
          if (q && !q.dying && q.g === g) continue;
          if (w.isSolid(nx, ny, nz)) continue;
          faces |= 1 << d;
        }
        waterBox(batch, mn, mx, p.flow, 2, faces);
        if (p.entry === 'top') {
          // 落点泡沫
          const f0 = mn.slice(), f1 = mx.slice();
          for (const a of [0, 1, 2]) if (a !== ga) { f0[a] = base[a] + 0.1; f1[a] = base[a] + 0.9; }
          if (floorSide === 'min') f1[ga] = f0[ga] + thick + 0.04; else f0[ga] = f1[ga] - thick - 0.04;
          waterBox(batch, f0, f1, g, 4, 63 & ~(1 << g));
        }
      } else {
        // 柱状水流
        let wA = 0.42, wB = 0.42;
        const sp = p.entry === 'side' ? p.flow : p.spill;
        const c = [p.x + 0.5, p.y + 0.5, p.z + 0.5];
        let spAxis = -1;
        if (sp >= 0 && sp < 6) {
          spAxis = axisOf(sp);
          c[spAxis] -= signOf(sp) * 0.22;
        }
        for (const a of [0, 1, 2]) {
          if (a === ga) continue;
          const half = a === spAxis ? 0.26 : spAxis >= 0 ? 0.46 : 0.2;
          mn[a] = c[a] - half * Math.min(1, p.fill * 1.3);
          mx[a] = c[a] + half * Math.min(1, p.fill * 1.3);
        }
        if (p.entry === 'side') {
          // 溢出口：只占一层薄水的高度
          if (floorSide === 'min') mx[ga] = mn[ga] + thick; else mn[ga] = mx[ga] - thick;
        }
        let faces = 63;
        // 沿重力轴的两端：与相邻柱体相接时省略
        const D = DIRS[g];
        const below = P.get(w.idx(p.x + D[0], p.y + D[1], p.z + D[2]));
        const above = P.get(w.idx(p.x - D[0], p.y - D[1], p.z - D[2]));
        if (below && below.falling) faces &= ~(1 << g);
        if (above && above.falling && p.entry !== 'side') faces &= ~(1 << (g ^ 1));
        if (below && !below.falling) {
          // 延伸进下方薄水，避免缝隙
          const bt = 0.1 + 0.12 * (below.level / MAX_LEVEL);
          if (gs > 0) mx[ga] += 1 - bt; else mn[ga] -= 1 - bt;
        }
        waterBox(batch, mn, mx, g, 1, faces);
      }
    }
  }
}

const WHITE = [255, 255, 255];
function waterBox(b, mn, mx, flow, fx, faces) {
  const [x0, y0, z0] = mn, [x1, y1, z1] = mx;
  b.ensure(36);
  if (faces & 1) b.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], WHITE, 0, 0, fx, 0, flow);
  if (faces & 2) b.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], WHITE, 0, 1, fx, 0, flow);
  if (faces & 4) b.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], WHITE, 0, 2, fx, 0, flow);
  if (faces & 8) b.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], WHITE, 0, 3, fx, 0, flow);
  if (faces & 16) b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], WHITE, 0, 4, fx, 0, flow);
  if (faces & 32) b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], WHITE, 0, 5, fx, 0, flow);
}
