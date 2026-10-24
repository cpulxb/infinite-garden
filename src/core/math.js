// 轻量数学库：向量用普通数组 [x,y,z]，四元数 [x,y,z,w]，矩阵为列主序 Float32Array(16)

// 六个轴向：0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
export const DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
export const opp = (d) => d ^ 1;
export const axisOf = (d) => d >> 1;
export const signOf = (d) => (d & 1 ? -1 : 1);
export const dirOf = (axis, sign) => axis * 2 + (sign < 0 ? 1 : 0);

export function dirFromVec(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  if (ax >= ay && ax >= az) return v[0] >= 0 ? 0 : 1;
  if (ay >= az) return v[1] >= 0 ? 2 : 3;
  return v[2] >= 0 ? 4 : 5;
}

// 与重力方向垂直的四个方向
export function lateralDirs(g) {
  const a = axisOf(g);
  const out = [];
  for (let d = 0; d < 6; d++) if (axisOf(d) !== a) out.push(d);
  return out;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const mod = (a, n) => ((a % n) + n) % n;

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  copy: (a) => [a[0], a[1], a[2]],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

// 周期世界中两点的最短差向量
export function wrapDelta(a, b, size) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  for (let i = 0; i < 3; i++) {
    const s = size[i];
    d[i] -= Math.round(d[i] / s) * s;
  }
  return d;
}

// ---------- 四元数 ----------
export const quat = {
  ident: () => [0, 0, 0, 1],
  axisAngle(axis, ang) {
    const s = Math.sin(ang / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)];
  },
  mul(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  },
  rot(q, v) {
    const [qx, qy, qz, qw] = q;
    const ix = qw * v[0] + qy * v[2] - qz * v[1];
    const iy = qw * v[1] + qz * v[0] - qx * v[2];
    const iz = qw * v[2] + qx * v[1] - qy * v[0];
    const iw = -qx * v[0] - qy * v[1] - qz * v[2];
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
  },
  norm(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  },
  slerp(a, b, t) {
    let [bx, by, bz, bw] = b;
    let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let k0, k1;
    if (1 - c > 1e-6) {
      const o = Math.acos(c), so = Math.sin(o);
      k0 = Math.sin((1 - t) * o) / so;
      k1 = Math.sin(t * o) / so;
    } else { k0 = 1 - t; k1 = t; }
    return quat.norm([a[0] * k0 + bx * k1, a[1] * k0 + by * k1, a[2] * k0 + bz * k1, a[3] * k0 + bw * k1]);
  },
  // 由 3x3 旋转矩阵（列向量 cx,cy,cz）求四元数
  fromBasis(cx, cy, cz) {
    const m00 = cx[0], m10 = cx[1], m20 = cx[2];
    const m01 = cy[0], m11 = cy[1], m21 = cy[2];
    const m02 = cz[0], m12 = cz[1], m22 = cz[2];
    const tr = m00 + m11 + m22;
    let x, y, z, w;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    return quat.norm([x, y, z, w]);
  },
  // 把姿态四元数吸附到最近的轴对齐姿态（消除累计误差）
  snapAxis(q) {
    const r = (v) => {
      const d = dirFromVec(v);
      return DIRS[d].slice();
    };
    const cx = r(quat.rot(q, [1, 0, 0]));
    const cy = r(quat.rot(q, [0, 1, 0]));
    const cz = v3.cross(cx, cy);
    return quat.fromBasis(cx, cy, cz);
  },
  // 把 a 旋转到 b 的最短旋转（单位向量）
  fromTo(a, b, fallbackAxis) {
    const d = v3.dot(a, b);
    if (d > 0.99999) return [0, 0, 0, 1];
    if (d < -0.99999) return quat.axisAngle(fallbackAxis, Math.PI);
    const ax = v3.norm(v3.cross(a, b));
    return quat.axisAngle(ax, Math.acos(clamp(d, -1, 1)));
  },
};

// ---------- 4x4 矩阵 ----------
export const mat4 = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  },
  // 仅旋转的视图矩阵（相机相对渲染），由相机姿态四元数得出
  viewFromQuat(q) {
    const r = quat.rot(q, [1, 0, 0]), u = quat.rot(q, [0, 1, 0]), b = quat.rot(q, [0, 0, 1]);
    const m = new Float32Array(16);
    m[0] = r[0]; m[4] = r[1]; m[8] = r[2];
    m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
    m[2] = b[0]; m[6] = b[1]; m[10] = b[2];
    m[15] = 1;
    return m;
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  },
};

// 由 viewProj 矩阵提取视锥六个平面（相机相对坐标）
export function frustumPlanes(m) {
  const p = [];
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const add = (a, b, s) => {
    const q = [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
    const l = Math.hypot(q[0], q[1], q[2]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  p.push(add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), add(r3, r2, 1), add(r3, r2, -1));
  return p;
}

export function boxInFrustum(planes, mn, mx) {
  for (let i = 0; i < 6; i++) {
    const p = planes[i];
    const x = p[0] > 0 ? mx[0] : mn[0];
    const y = p[1] > 0 ? mx[1] : mn[1];
    const z = p[2] > 0 ? mx[2] : mn[2];
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
  }
  return true;
}

// 射线与 AABB 求交，返回 {t, n} 或 null（n 为命中面的外法线方向编号）
export function rayBox(o, d, mn, mx, tMax = Infinity) {
  let t0 = -Infinity, t1 = Infinity, nAxis = -1, nSign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
      continue;
    }
    let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i];
    let s = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
    if (ta > t0) { t0 = ta; nAxis = i; nSign = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (t0 < 0 || t0 > tMax || nAxis < 0) return null;
  return { t: t0, n: dirOf(nAxis, nSign) };
}

// 简单可复现随机数
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
