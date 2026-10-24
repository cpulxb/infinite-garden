// 关卡搭建 DSL：在体素网格上堆砌建筑，并登记方块、插槽、门、水源、树与光门
import { World, SOLID, SLAB } from './world.js';
import { DIRS, opp, hexToRgb, rng } from '../core/math.js';

// 材质编号
export const M = {
  STONE: 0,   // 主体石材
  PANEL: 1,   // 带分缝的次级石材
  DARK: 2,    // 深色基座
  ACCENT: 3,  // 点缀色
  GLOW: 4,    // 发光灯石
  SOIL: 5,    // 苔土
  TRIM: 6,    // 浅色饰边
  CHANNEL: 7, // 水渠内衬
};
const MAT_FX = [0, 1, 0, 0, 3, 2, 0, 1];

export function resolvePalette(p) {
  const mats = p.mats.map((hex, i) => {
    const c = hexToRgb(hex);
    return {
      color: [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)],
      emissive: i === M.GLOW ? 230 : 0,
      fx: MAT_FX[i],
    };
  });
  return { ...p, mats };
}

export class Builder {
  constructor(size) {
    this.size = size;
    this.world = new World(size[0], size[1], size[2]);
    this.cubes = [];
    this.sockets = [];
    this.doors = [];
    this.sources = [];
    this.trees = [];
    this.basins = [];
    this.portals = [];
    this.spawn = { pos: [size[0] / 2, size[1] / 2, size[2] / 2], grav: 3, yaw: 0 };
    this.marks = {};
  }

  // ---------- 基础体素 ----------
  box(x0, y0, z0, x1, y1, z1, mat = M.STONE) {
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) this.world.set(x, y, z, SOLID, mat);
    return this;
  }
  clear(x0, y0, z0, x1, y1, z1) {
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) this.world.set(x, y, z, 0, 0);
    return this;
  }
  paint(x0, y0, z0, x1, y1, z1, mat) {
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = this.world.idx(x, y, z);
          if (this.world.type[i]) this.world.mat[i] = mat;
        }
    return this;
  }
  slab(x, y, z, dir = 3, mat = M.STONE) { this.world.set(x, y, z, SLAB + dir, mat); return this; }

  // 楼梯：沿 fwd 方向每格升高半格（up 为上方向），宽度沿 side 方向
  stairs(x, y, z, fwd, up, length, side, width = 1, mat = M.STONE) {
    const F = DIRS[fwd], U = DIRS[up], Sd = DIRS[side];
    for (let j = 0; j < length; j++) {
      const hgt = (j + 1) * 0.5;
      const full = Math.floor(hgt);
      for (let w = 0; w < width; w++) {
        const bx = x + F[0] * j + Sd[0] * w, by = y + F[1] * j + Sd[1] * w, bz = z + F[2] * j + Sd[2] * w;
        for (let k = 0; k < full; k++) this.world.set(bx + U[0] * k, by + U[1] * k, bz + U[2] * k, SOLID, mat);
        if (hgt > full) this.slab(bx + U[0] * full, by + U[1] * full, bz + U[2] * full, opp(up), mat);
      }
    }
    return this;
  }

  // ---------- 建筑母题 ----------
  // 悬浮平台：顶面在 top，下方是逐层收缩的倒金字塔
  platform(x0, z0, x1, z1, top, thick = 3, mat = M.STONE, under = 3) {
    this.box(x0, top - thick, z0, x1, top, z1, mat);
    let ix0 = x0, iz0 = z0, ix1 = x1, iz1 = z1, y = top - thick;
    for (let i = 0; i < under; i++) {
      const s = i === 0 ? 1 : 2;
      ix0 += s; iz0 += s; ix1 -= s; iz1 -= s;
      if (ix1 - ix0 < 2 || iz1 - iz0 < 2) break;
      const hh = i === under - 1 ? 3 : 2;
      this.box(ix0, y - hh, iz0, ix1, y, iz1, i % 2 ? M.PANEL : M.DARK);
      y -= hh;
    }
    return this;
  }
  pillar(x, z, y0, y1, mat = M.PANEL, w = 1) { return this.box(x, y0, z, x + w, y1, z + w, mat); }
  // 一排柱子加横梁
  colonnade(x0, z0, x1, z1, y0, h, step = 3, mat = M.PANEL) {
    const alongX = x1 - x0 > z1 - z0;
    if (alongX) {
      for (let x = x0; x < x1; x += step) this.box(x, y0, z0, x + 1, y0 + h, z0 + 1, mat);
      this.box(x0, y0 + h, z0, x1, y0 + h + 1, z0 + 1, M.TRIM);
    } else {
      for (let z = z0; z < z1; z += step) this.box(x0, y0, z, x0 + 1, y0 + h, z + 1, mat);
      this.box(x0, y0 + h, z0, x0 + 1, y0 + h + 1, z1, M.TRIM);
    }
    return this;
  }
  // 空心方框（漂浮装饰）
  frame(cx, cy, cz, r, axis = 2, t = 1, mat = M.PANEL) {
    const a = axis >> 1;
    const u = (a + 1) % 3, v = (a + 2) % 3;
    for (let i = -r; i < r; i++)
      for (let j = -r; j < r; j++) {
        if (i >= -r + t && i < r - t && j >= -r + t && j < r - t) continue;
        const p = [cx, cy, cz];
        p[u] += i; p[v] += j;
        this.world.set(p[0], p[1], p[2], SOLID, mat);
      }
    return this;
  }
  // 拱门：两根柱子与过梁（沿 x 或 z 方向开口）
  arch(x, y, z, alongX, span, h, mat = M.TRIM) {
    if (alongX) {
      this.box(x, y, z, x + 1, y + h, z + 1, mat);
      this.box(x + span + 1, y, z, x + span + 2, y + h, z + 1, mat);
      this.box(x, y + h, z, x + span + 2, y + h + 1, z + 1, mat);
    } else {
      this.box(x, y, z, x + 1, y + h, z + 1, mat);
      this.box(x, y, z + span + 1, x + 1, y + h, z + span + 2, mat);
      this.box(x, y + h, z, x + 1, y + h + 1, z + span + 2, mat);
    }
    return this;
  }
  lamp(x, y, z) { this.world.set(x, y, z, SOLID, M.GLOW); return this; }

  // ---------- 机关 ----------
  spawnAt(x, y, z, yawDeg = 0, grav = 3) {
    this.spawn = { pos: [x, y, z], grav, yaw: (yawDeg * Math.PI) / 180 };
    return this;
  }
  // 方块：给出所在格子，颜色即重力方向
  cube(x, y, z, color) {
    this.cubes.push({ cell: [x, y, z], color });
    return this;
  }
  // 插槽：cube 坐在 (x,y,z) 格中，紧贴 color 方向的表面
  socket(id, x, y, z, color) {
    this.sockets.push({ id, cell: [x, y, z], color });
    return this;
  }
  // 门：闭合时占据盒子，打开时平移 open
  door(id, x0, y0, z0, x1, y1, z1, opts) {
    this.doors.push({ id, min: [x0, y0, z0], max: [x1, y1, z1], open: opts.open, requires: opts.requires || [], mat: opts.mat ?? M.PANEL, any: !!opts.any });
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.world.set(x, y, z, 0, 0);
    return this;
  }
  water(x, y, z, grav = 3) { this.sources.push({ cell: [x, y, z], grav }); return this; }
  tree(id, x, y, z, color, opts = {}) {
    this.trees.push({ id, cell: [x, y, z], color, fruits: opts.fruits ?? 2, seed: opts.seed ?? (x * 73856093) ^ (z * 19349663), deco: false, scale: opts.scale ?? 1, palette: opts.palette });
    return this;
  }
  decoTree(x, y, z, color, opts = {}) {
    this.trees.push({ id: null, cell: [x, y, z], color, fruits: 0, seed: opts.seed ?? (x * 7919 + z * 104729 + y * 31), deco: true, scale: opts.scale ?? 1, palette: opts.palette, hue: opts.hue });
    return this;
  }
  basin(id, x, y, z) { this.basins.push({ id, cell: [x, y, z] }); return this; }
  // 光门：min/max 为触发区域，facing 为开口朝向，frame 为是否自动搭门框
  portal(x0, y0, z0, x1, y1, z1, opts = {}) {
    this.portals.push({ min: [x0, y0, z0], max: [x1, y1, z1], requires: opts.requires || [], axis: opts.axis ?? 0, up: opts.up ?? 2 });
    return this;
  }
  mark(name, x0, y0, z0, x1, y1, z1) { this.marks[name] = [x0, y0, z0, x1, y1, z1]; return this; }

  // 随机碎石装饰（远处漂浮的小方块群）
  scatter(seed, count, region, sizeMax = 2, mat = M.PANEL) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(region[0] + r() * (region[3] - region[0]));
      const y = Math.floor(region[1] + r() * (region[4] - region[1]));
      const z = Math.floor(region[2] + r() * (region[5] - region[2]));
      const s = 1 + Math.floor(r() * sizeMax);
      this.box(x, y, z, x + s, y + s, z + s, mat);
    }
    return this;
  }
}
