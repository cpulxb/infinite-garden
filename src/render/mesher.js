// 静态体素网格：贪心合并 + 顶点环境光遮蔽（AO），周期边界上的邻居按取模查询
import { DIRS, opp } from '../core/math.js';
import { SOLID, SLAB, EMPTY } from '../world/world.js';
import { STRIDE } from './batch.js';

class IndexedBuilder {
  constructor() {
    this.cap = 65536;
    this.buf = new ArrayBuffer(this.cap * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.nv = 0;
    this.icap = 98304;
    this.idx = new Uint32Array(this.icap);
    this.ni = 0;
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }
  grow() {
    const nc = this.cap * 2;
    const nb = new ArrayBuffer(nc * STRIDE);
    new Uint8Array(nb).set(this.u8);
    this.buf = nb; this.f32 = new Float32Array(nb); this.u8 = new Uint8Array(nb); this.cap = nc;
  }
  growIdx() {
    const ni = new Uint32Array(this.icap * 2);
    ni.set(this.idx);
    this.idx = ni; this.icap *= 2;
  }
  v(p, c, e, dir, ao, fx, id) {
    if (this.nv >= this.cap) this.grow();
    const i = this.nv++;
    const fo = i * 5, bo = i * STRIDE;
    this.f32[fo] = p[0]; this.f32[fo + 1] = p[1]; this.f32[fo + 2] = p[2];
    const u = this.u8;
    u[bo + 12] = c[0]; u[bo + 13] = c[1]; u[bo + 14] = c[2]; u[bo + 15] = e;
    u[bo + 16] = dir; u[bo + 17] = ao; u[bo + 18] = fx; u[bo + 19] = id;
    for (let k = 0; k < 3; k++) {
      if (p[k] < this.min[k]) this.min[k] = p[k];
      if (p[k] > this.max[k]) this.max[k] = p[k];
    }
    return i;
  }
  // 四个角按逆时针给出，aos 为 0..3
  quad(ps, aos, c, e, dir, fx, id) {
    const AO = [70, 150, 210, 255];
    const b = this.nv;
    for (let k = 0; k < 4; k++) this.v(ps[k], c, e, dir, AO[aos[k]], fx, id);
    if (this.ni + 6 > this.icap) this.growIdx();
    const I = this.idx;
    if (aos[0] + aos[2] < aos[1] + aos[3]) {
      I[this.ni++] = b + 1; I[this.ni++] = b + 2; I[this.ni++] = b + 3;
      I[this.ni++] = b + 1; I[this.ni++] = b + 3; I[this.ni++] = b;
    } else {
      I[this.ni++] = b; I[this.ni++] = b + 1; I[this.ni++] = b + 2;
      I[this.ni++] = b; I[this.ni++] = b + 2; I[this.ni++] = b + 3;
    }
  }
}

// palette.mats: [{color:[r,g,b](0..255), emissive, fx}]
export function meshWorld(world, palette) {
  const [sx, sy, sz] = world.size;
  const dims = [sx, sy, sz];
  const B = new IndexedBuilder();
  const T = world.type, M = world.mat;
  const tAt = (x, y, z) => T[world.idx(x, y, z)];
  const occ = (x, y, z) => (T[world.idx(x, y, z)] !== EMPTY ? 1 : 0);

  for (let d = 0; d < 6; d++) {
    const a = d >> 1, u = (a + 1) % 3, v = (a + 2) % 3;
    const s = d & 1 ? -1 : 1;
    const du = dims[u], dv = dims[v], da = dims[a];
    const mask = new Int32Array(du * dv);
    const N = DIRS[d];
    const c = [0, 0, 0];
    for (let i = 0; i < da; i++) {
      // 构建该切片的面掩码
      let any = false;
      for (let j = 0; j < dv; j++) {
        for (let k = 0; k < du; k++) {
          c[a] = i; c[u] = k; c[v] = j;
          const id = world.idx(c[0], c[1], c[2]);
          let key = 0;
          if (T[id] === SOLID) {
            const nx = c[0] + N[0], ny = c[1] + N[1], nz = c[2] + N[2];
            const nt = tAt(nx, ny, nz);
            const covered = nt === SOLID || (nt >= SLAB && nt - SLAB === opp(d));
            if (!covered) {
              // 四角 AO：角点顺序 (0,0),(1,0),(1,1),(0,1)（u,v 空间）
              let aoPack = 0;
              for (let q = 0; q < 4; q++) {
                const cu = q === 1 || q === 2 ? 1 : -1;
                const cv = q >= 2 ? 1 : -1;
                const L = [nx, ny, nz];
                const s1 = L.slice(); s1[u] += cu;
                const s2 = L.slice(); s2[v] += cv;
                const cc = L.slice(); cc[u] += cu; cc[v] += cv;
                const o1 = occ(s1[0], s1[1], s1[2]), o2 = occ(s2[0], s2[1], s2[2]);
                const oc = occ(cc[0], cc[1], cc[2]);
                const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
                aoPack |= ao << (q * 2);
              }
              key = 1 + M[id] + (aoPack << 4);
              any = true;
            }
          }
          mask[k + j * du] = key;
        }
      }
      if (!any) continue;
      // 贪心合并：AO 沿某方向有变化时禁止沿该方向扩展
      for (let j = 0; j < dv; j++) {
        for (let k = 0; k < du; ) {
          const key = mask[k + j * du];
          if (!key) { k++; continue; }
          const ao = key >> 4;
          const a0 = ao & 3, a1 = (ao >> 2) & 3, a2 = (ao >> 4) & 3, a3 = (ao >> 6) & 3;
          const canU = a0 === a1 && a3 === a2;
          const canV = a0 === a3 && a1 === a2;
          let w = 1;
          if (canU) while (k + w < du && mask[k + w + j * du] === key) w++;
          let h = 1;
          if (canV) {
            outer: while (j + h < dv) {
              for (let q = 0; q < w; q++) if (mask[k + q + (j + h) * du] !== key) break outer;
              h++;
            }
          }
          for (let jj = 0; jj < h; jj++) for (let q = 0; q < w; q++) mask[k + q + (j + jj) * du] = 0;
          const mat = (key - 1) & 15;
          const pm = palette.mats[mat] || palette.mats[0];
          const plane = s > 0 ? i + 1 : i;
          const P = (uu, vv) => { const p = [0, 0, 0]; p[a] = plane; p[u] = uu; p[v] = vv; return p; };
          let ps = [P(k, j), P(k + w, j), P(k + w, j + h), P(k, j + h)];
          let aos = [a0, a1, a2, a3];
          if (s < 0) { ps = [ps[0], ps[3], ps[2], ps[1]]; aos = [a0, a3, a2, a1]; }
          B.quad(ps, aos, pm.color, pm.emissive, d, pm.fx, 1);
          k += w;
        }
      }
    }
  }

  // 半砖：逐个输出半盒子
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const id = world.idx(x, y, z);
        const t = T[id];
        if (t < SLAB) continue;
        const sd = t - SLAB;
        const b = [x, y, z, x + 1, y + 1, z + 1];
        const sa = sd >> 1;
        if (sd & 1) b[sa + 3] -= 0.5; else b[sa] += 0.5;
        const pm = palette.mats[M[id]] || palette.mats[0];
        for (let d = 0; d < 6; d++) {
          // 贴合格子外表面的面：被相邻实心格覆盖时剔除
          const outer = d === sd || axisDiff(d, sd);
          if (outer) {
            const n = DIRS[d];
            if (tAt(x + n[0], y + n[1], z + n[2]) === SOLID) continue;
          }
          const a = d >> 1, u = (a + 1) % 3, v = (a + 2) % 3;
          const plane = d & 1 ? b[a] : b[a + 3];
          const P = (uu, vv) => { const p = [0, 0, 0]; p[a] = plane; p[u] = uu; p[v] = vv; return p; };
          let ps = [P(b[u], b[v]), P(b[u + 3], b[v]), P(b[u + 3], b[v + 3]), P(b[u], b[v + 3])];
          if (d & 1) ps = [ps[0], ps[3], ps[2], ps[1]];
          B.quad(ps, [3, 3, 3, 3], pm.color, pm.emissive, d, pm.fx, 1);
        }
      }

  return {
    vertices: new Uint8Array(B.buf, 0, B.nv * STRIDE),
    indices: B.idx.subarray(0, B.ni),
    count: B.ni,
    min: B.min, max: B.max,
  };
}

// 侧面（与半砖方向不同轴）同样贴着格子外表面
function axisDiff(d, sd) { return (d >> 1) !== (sd >> 1); }
