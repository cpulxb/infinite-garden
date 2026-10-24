// 统一顶点格式：pos(3×f32) + color(4×u8: rgb, emissive) + info(4×u8: dir, ao/flow, fx, id) = 20 字节
export const STRIDE = 20;

export class Batch {
  constructor(capVerts = 4096) {
    this.cap = capVerts;
    this.buf = new ArrayBuffer(capVerts * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.count = 0;
    this.version = 0;
  }
  reset() { this.count = 0; this.version++; }
  ensure(n) {
    if (this.count + n <= this.cap) return;
    let c = this.cap;
    while (c < this.count + n) c *= 2;
    const nb = new ArrayBuffer(c * STRIDE);
    new Uint8Array(nb).set(this.u8.subarray(0, this.count * STRIDE));
    this.buf = nb; this.f32 = new Float32Array(nb); this.u8 = new Uint8Array(nb); this.cap = c;
  }
  vert(x, y, z, r, g, b, e, dir, ao, fx, id) {
    const i = this.count++;
    const fo = i * 5, bo = i * STRIDE;
    this.f32[fo] = x; this.f32[fo + 1] = y; this.f32[fo + 2] = z;
    const u = this.u8;
    u[bo + 12] = r; u[bo + 13] = g; u[bo + 14] = b; u[bo + 15] = e;
    u[bo + 16] = dir; u[bo + 17] = ao; u[bo + 18] = fx; u[bo + 19] = id;
  }
  // 四边形（p0..p3 逆时针，朝向法线方向）
  quad(p0, p1, p2, p3, c, e, dir, fx, id, ao = 255) {
    this.ensure(6);
    const r = c[0], g = c[1], b = c[2];
    this.vert(p0[0], p0[1], p0[2], r, g, b, e, dir, ao, fx, id);
    this.vert(p1[0], p1[1], p1[2], r, g, b, e, dir, ao, fx, id);
    this.vert(p2[0], p2[1], p2[2], r, g, b, e, dir, ao, fx, id);
    this.vert(p0[0], p0[1], p0[2], r, g, b, e, dir, ao, fx, id);
    this.vert(p2[0], p2[1], p2[2], r, g, b, e, dir, ao, fx, id);
    this.vert(p3[0], p3[1], p3[2], r, g, b, e, dir, ao, fx, id);
  }
  // 轴对齐盒子；c 为 0..255 的 rgb；faces 为可选的六位掩码
  box(x0, y0, z0, x1, y1, z1, c, e = 0, fx = 0, id = 1, faces = 63, aoBottom = 255) {
    if (faces & 1) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], c, e, 0, fx, id); // +X
    if (faces & 2) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], c, e, 1, fx, id); // -X
    if (faces & 4) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], c, e, 2, fx, id); // +Y
    if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c, e, 3, fx, id, aoBottom); // -Y
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c, e, 4, fx, id); // +Z
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c, e, 5, fx, id); // -Z
  }
  boxC(cx, cy, cz, hx, hy, hz, c, e, fx, id, faces) {
    this.box(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, c, e, fx, id, faces);
  }
}
