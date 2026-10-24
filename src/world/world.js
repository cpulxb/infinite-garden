// 周期体素世界：所有坐标在三个轴上首尾相连
import { axisOf, signOf, rayBox } from '../core/math.js';

export const EMPTY = 0;
export const SOLID = 1;
// 2..7 为半砖：占据格子靠近方向 d 的那一半（d = type - 2）
export const SLAB = 2;

export class World {
  constructor(sx, sy, sz) {
    this.size = [sx, sy, sz];
    this.n = sx * sy * sz;
    this.type = new Uint8Array(this.n);
    this.mat = new Uint8Array(this.n);
  }

  idx(x, y, z) {
    const [sx, sy, sz] = this.size;
    x %= sx; if (x < 0) x += sx;
    y %= sy; if (y < 0) y += sy;
    z %= sz; if (z < 0) z += sz;
    return x + sx * (y + sy * z);
  }

  get(x, y, z) { return this.type[this.idx(x, y, z)]; }
  getMat(x, y, z) { return this.mat[this.idx(x, y, z)]; }
  set(x, y, z, t, m = 0) {
    const i = this.idx(x, y, z);
    this.type[i] = t;
    this.mat[i] = m;
  }
  isFull(x, y, z) { return this.type[this.idx(x, y, z)] === SOLID; }
  isSolid(x, y, z) { return this.type[this.idx(x, y, z)] !== EMPTY; }

  // 某个格子内部的碰撞盒（未取模坐标）
  cellBox(x, y, z, t, out) {
    if (t === SOLID) {
      out.push([x, y, z, x + 1, y + 1, z + 1]);
      return;
    }
    const d = t - SLAB, a = axisOf(d), s = signOf(d);
    const b = [x, y, z, x + 1, y + 1, z + 1];
    if (s > 0) b[a] += 0.5; else b[a + 3] -= 0.5;
    out.push(b);
  }

  // 收集与给定 AABB 相交的所有静态碰撞盒
  queryBoxes(mn, mx, out) {
    const x0 = Math.floor(mn[0]), y0 = Math.floor(mn[1]), z0 = Math.floor(mn[2]);
    const x1 = Math.floor(mx[0]), y1 = Math.floor(mx[1]), z1 = Math.floor(mx[2]);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const t = this.type[this.idx(x, y, z)];
          if (t !== EMPTY) this.cellBox(x, y, z, t, out);
        }
    return out;
  }

  // DDA 体素射线。返回 {t, n, cell} 或 null；起点所在的实心格会被忽略
  raycast(o, d, maxT) {
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
    const adx = Math.abs(d[0]), ady = Math.abs(d[1]), adz = Math.abs(d[2]);
    let tmx = adx > 1e-12 ? (sx > 0 ? x + 1 - o[0] : o[0] - x) / adx : Infinity;
    let tmy = ady > 1e-12 ? (sy > 0 ? y + 1 - o[1] : o[1] - y) / ady : Infinity;
    let tmz = adz > 1e-12 ? (sz > 0 ? z + 1 - o[2] : o[2] - z) / adz : Infinity;
    const tdx = adx > 1e-12 ? 1 / adx : Infinity;
    const tdy = ady > 1e-12 ? 1 / ady : Infinity;
    const tdz = adz > 1e-12 ? 1 / adz : Infinity;
    let t = 0, face = -1;
    const tmp = [];
    for (let guard = 0; guard < 512 && t <= maxT; guard++) {
      const ty = this.type[this.idx(x, y, z)];
      if (ty !== EMPTY && face >= 0) {
        if (ty === SOLID) return { t, n: face, cell: [x, y, z] };
        tmp.length = 0;
        this.cellBox(x, y, z, ty, tmp);
        const b = tmp[0];
        const h = rayBox(o, d, [b[0], b[1], b[2]], [b[3], b[4], b[5]], maxT);
        if (h) return { t: h.t, n: h.n, cell: [x, y, z] };
      } else if (ty !== EMPTY && face < 0 && ty !== SOLID) {
        tmp.length = 0;
        this.cellBox(x, y, z, ty, tmp);
        const b = tmp[0];
        const h = rayBox(o, d, [b[0], b[1], b[2]], [b[3], b[4], b[5]], maxT);
        if (h && h.t > 1e-4) return { t: h.t, n: h.n, cell: [x, y, z] };
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; face = sx > 0 ? 1 : 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; face = sy > 0 ? 3 : 2; }
      else { z += sz; t = tmz; tmz += tdz; face = sz > 0 ? 5 : 4; }
    }
    return null;
  }
}
