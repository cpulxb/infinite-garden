// 渲染管线：G-buffer → 半透明 → 合成（描边/雾/天空）→ 泛光 → 调色 → FXAA
import { Program, makeTex, makeFBO, makeMeshVAO } from './gl.js';
import * as S from './shaders.js';
import { mat4, quat, frustumPlanes, boxInFrustum } from '../core/math.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    this.pSolid = new Program(gl, S.SOLID_VS, S.SOLID_FS, 'solid');
    this.pTrans = new Program(gl, S.TRANS_VS, S.TRANS_FS, 'trans');
    this.pPart = new Program(gl, S.PART_VS, S.PART_FS, 'part');
    this.pComp = new Program(gl, S.FS_VS, S.COMPOSITE_FS, 'composite');
    this.pBright = new Program(gl, S.FS_VS, S.BRIGHT_FS, 'bright');
    this.pBlur = new Program(gl, S.FS_VS, S.BLUR_FS, 'blur');
    this.pFinal = new Program(gl, S.FS_VS, S.FINAL_FS, 'final');
    this.pFxaa = new Program(gl, S.FS_VS, S.FXAA_FS, 'fxaa');
    this.pShadow = new Program(gl, S.SHADOW_VS, S.SHADOW_FS, 'shadow');
    // 阴影贴图
    this.shadowSize = 2048;
    this.tShadow = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tShadow);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.fShadow = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fShadow);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tShadow, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lightDir = normalize3([0.55, 0.7, 0.45]);
    this.emptyVAO = gl.createVertexArray();

    // 实例偏移缓冲
    this.maxInst = 4096;
    this.instStatic = gl.createBuffer();
    this.instDyn = gl.createBuffer();
    this.instOne = gl.createBuffer();
    for (const b of [this.instStatic, this.instDyn]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, this.maxInst * 12, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instOne);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW);
    this.offStatic = new Float32Array(this.maxInst * 3);
    this.offDyn = new Float32Array(this.maxInst * 3);

    // 静态网格
    this.sVbo = gl.createBuffer();
    this.sIbo = gl.createBuffer();
    this.sVao = makeMeshVAO(gl, this.sVbo, this.sIbo, this.instStatic);
    this.sCount = 0;

    // 动态（不透明）与半透明批次
    this.dVbo = gl.createBuffer();
    this.dVao = makeMeshVAO(gl, this.dVbo, null, this.instDyn);
    this.tVbo = gl.createBuffer();
    this.tVao = makeMeshVAO(gl, this.tVbo, null, this.instDyn);
    this.dCap = 0; this.tCap = 0;

    // 粒子
    this.pVbo = gl.createBuffer();
    this.pVao = gl.createVertexArray();
    gl.bindVertexArray(this.pVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindVertexArray(null);

    this.w = 0; this.h = 0;
    this.stats = { copies: 0, tris: 0 };
  }

  resize(cssW, cssH, scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(2, Math.round(cssW * dpr)), Hh = Math.max(2, Math.round(cssH * dpr));
    this.canvas.width = W; this.canvas.height = Hh;
    const rw = Math.max(2, Math.round(W * scale)), rh = Math.max(2, Math.round(Hh * scale));
    if (rw === this.w && rh === this.h && W === this.outW && Hh === this.outH) return;
    this.outW = W; this.outH = Hh;
    this.w = rw; this.h = rh;
    this.alloc();
  }

  alloc() {
    const gl = this.gl;
    const del = (t) => t && gl.deleteTexture(t);
    [this.tCol, this.tNrm, this.tDep, this.tComp, this.tB1, this.tB1b, this.tB2, this.tB2b, this.tLdr].forEach(del);
    [this.fG, this.fT, this.fN, this.fComp, this.fB1, this.fB1b, this.fB2, this.fB2b, this.fLdr].forEach((f) => f && gl.deleteFramebuffer(f));
    const w = this.w, h = this.h;
    const HF = this.hdr ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    this.tCol = makeTex(gl, w, h, HF[0], HF[1], HF[2], gl.NEAREST);
    this.tNrm = makeTex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.tDep = makeTex(gl, w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    this.fG = makeFBO(gl, [this.tCol, this.tNrm], this.tDep);
    this.fT = makeFBO(gl, [this.tCol], this.tDep);
    this.fN = makeFBO(gl, [this.tNrm], this.tDep);
    this.tComp = makeTex(gl, w, h, HF[0], HF[1], HF[2], gl.LINEAR);
    this.fComp = makeFBO(gl, [this.tComp], null);
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
    const w4 = Math.max(1, w >> 2), h4 = Math.max(1, h >> 2);
    this.b1 = [w2, h2]; this.b2 = [w4, h4];
    this.tB1 = makeTex(gl, w2, h2, HF[0], HF[1], HF[2]);
    this.tB1b = makeTex(gl, w2, h2, HF[0], HF[1], HF[2]);
    this.tB2 = makeTex(gl, w4, h4, HF[0], HF[1], HF[2]);
    this.tB2b = makeTex(gl, w4, h4, HF[0], HF[1], HF[2]);
    this.fB1 = makeFBO(gl, [this.tB1], null);
    this.fB1b = makeFBO(gl, [this.tB1b], null);
    this.fB2 = makeFBO(gl, [this.tB2], null);
    this.fB2b = makeFBO(gl, [this.tB2b], null);
    this.tLdr = makeTex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.fLdr = makeFBO(gl, [this.tLdr], null);
  }

  setStatic(mesh, size) {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sVbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.sCount = mesh.count;
    this.sMin = mesh.count ? mesh.min : [0, 0, 0];
    this.sMax = mesh.count ? mesh.max : [0, 0, 0];
    this.size = size;
    this.lightVP = lightMatrix(size, this.lightDir);
  }

  uploadBatch(vbo, batch, capKey) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const bytes = batch.count * 20;
    if (bytes > this[capKey]) {
      this[capKey] = Math.max(bytes, 65536) * 2;
      gl.bufferData(gl.ARRAY_BUFFER, this[capKey], gl.DYNAMIC_DRAW);
    }
    if (bytes) gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.u8, 0, bytes);
  }

  // 计算需要绘制的世界副本（视锥 + 雾距剔除）
  copies(cam, planes, R, fogEnd) {
    const sz = this.size;
    let ns = 0, nd = 0;
    const smn = this.sMin, smx = this.sMax;
    const mn = [0, 0, 0], mx = [0, 0, 0];
    const fe2 = fogEnd * fogEnd;
    const pad = 1.5;
    for (let kz = -R; kz <= R; kz++)
      for (let ky = -R; ky <= R; ky++)
        for (let kx = -R; kx <= R; kx++) {
          const ox = kx * sz[0], oy = ky * sz[1], oz = kz * sz[2];
          // 动态：整个周期盒
          mn[0] = ox - cam[0] - pad; mn[1] = oy - cam[1] - pad; mn[2] = oz - cam[2] - pad;
          mx[0] = mn[0] + sz[0] + 2 * pad; mx[1] = mn[1] + sz[1] + 2 * pad; mx[2] = mn[2] + sz[2] + 2 * pad;
          if (boxDist2(mn, mx) > fe2) continue;
          if (!boxInFrustum(planes, mn, mx)) continue;
          if (nd < this.maxInst) { this.offDyn[nd * 3] = ox; this.offDyn[nd * 3 + 1] = oy; this.offDyn[nd * 3 + 2] = oz; nd++; }
          if (!this.sCount) continue;
          mn[0] = smn[0] + ox - cam[0]; mn[1] = smn[1] + oy - cam[1]; mn[2] = smn[2] + oz - cam[2];
          mx[0] = smx[0] + ox - cam[0]; mx[1] = smx[1] + oy - cam[1]; mx[2] = smx[2] + oz - cam[2];
          if (boxDist2(mn, mx) > fe2) continue;
          if (!boxInFrustum(planes, mn, mx)) continue;
          if (ns < this.maxInst) { this.offStatic[ns * 3] = ox; this.offStatic[ns * 3 + 1] = oy; this.offStatic[ns * 3 + 2] = oz; ns++; }
        }
    return [ns, nd];
  }

  draw(sc) {
    const gl = this.gl;
    const w = this.w, h = this.h;
    const aspect = this.outW / this.outH;
    const near = 0.05, far = sc.far || 900;
    const P = mat4.perspective(sc.fov, aspect, near, far);
    const V = mat4.viewFromQuat(sc.camQ);
    const VP = mat4.mul(P, V);
    const planes = frustumPlanes(VP);
    const cam = sc.camPos;
    const [ns, nd] = this.copies(cam, planes, sc.repeat, sc.fogEnd);
    this.stats.copies = ns;
    this.stats.tris = (this.sCount / 3) * ns;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instStatic);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.offStatic, 0, ns * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instDyn);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.offDyn, 0, nd * 3);

    // ---------- 阴影 ----------
    const shadowOn = sc.shadows !== false;
    if (shadowOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fShadow);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2.0, 4.0);
      this.pShadow.use().m4('uLightVP', this.lightVP);
      if (this.sCount) {
        gl.bindVertexArray(this.sVao);
        gl.drawElements(gl.TRIANGLES, this.sCount, gl.UNSIGNED_INT, 0);
      }
      if (sc.dyn && sc.dyn.count) {
        this.uploadBatch(this.dVbo, sc.dyn, 'dCap');
        gl.bindVertexArray(this.dVao);
        gl.drawArrays(gl.TRIANGLES, 0, sc.dyn.count);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---------- G-buffer ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fG);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0.5, 0]);
    gl.clearBufferfv(gl.DEPTH, 0, [1.0]);

    const ps = this.pSolid.use();
    ps.m4('uVP', VP).f3('uCam', cam).f3v('uGrav', sc.gravColors).f1('uTint', sc.tint)
      .f1v('uFace', sc.faceLight).f1('uTime', sc.time).f1('uAoStr', sc.aoStr).f3('uAmb', sc.amb)
      .m4('uLightVP', this.lightVP).f3('uLightDir', this.lightDir).f1('uShadowOn', shadowOn ? 1 : 0)
      .f1('uShadowTexel', 1 / this.shadowSize).tex('uShadow', 5, this.tShadow);
    if (this.sCount && ns) {
      gl.bindVertexArray(this.sVao);
      gl.drawElementsInstanced(gl.TRIANGLES, this.sCount, gl.UNSIGNED_INT, 0, ns);
    }
    if (sc.dyn && sc.dyn.count && nd) {
      if (!shadowOn) this.uploadBatch(this.dVbo, sc.dyn, 'dCap');
      gl.bindVertexArray(this.dVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, sc.dyn.count, nd);
    }

    // ---------- 半透明 ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    if (sc.trans && sc.trans.count && nd) {
      this.uploadBatch(this.tVbo, sc.trans, 'tCap');
      const pt = this.pTrans.use();
      pt.i1('uMode', 1);
      pt.m4('uVP', VP).f3('uCam', cam).f1('uTime', sc.time)
        .f3('uWaterDeep', sc.water[0]).f3('uWaterLight', sc.water[1]).f3('uSkyHor', sc.sky.hor);
      gl.bindVertexArray(this.tVao);
      // 先画不写深度的阴影（范围 [0, shadowCount)），再画写深度的水
      const sh = sc.transShadowCount || 0;
      gl.disable(gl.CULL_FACE);
      if (sh) {
        gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -2);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, sh, nd);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      // 水：先写入法线与深度（使描边只围绕水体本身），再按深度相等混合颜色
      gl.disable(gl.CULL_FACE);
      if (sc.trans.count > sh) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fN);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        pt.i1('uMode', 0);
        gl.drawArraysInstanced(gl.TRIANGLES, sh, sc.trans.count - sh, nd);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fT);
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        pt.i1('uMode', 1);
        gl.drawArraysInstanced(gl.TRIANGLES, sh, sc.trans.count - sh, nd);
        gl.depthMask(true);
      }
      gl.enable(gl.CULL_FACE);
    }
    if (sc.particles && sc.particleCount) {
      gl.bindVertexArray(this.pVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pVbo);
      gl.bufferData(gl.ARRAY_BUFFER, sc.particles.subarray(0, sc.particleCount * 4), gl.DYNAMIC_DRAW);
      gl.depthMask(false);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      this.pPart.use().m4('uVP', VP).f3('uCam', cam).f1('uPx', h * 1.2).f1('uTime', sc.time).f3('uPartCol', sc.partCol);
      gl.drawArrays(gl.POINTS, 0, sc.particleCount);
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // ---------- 合成 ----------
    gl.bindVertexArray(this.emptyVAO);
    const fwd = quat.rot(sc.camQ, [0, 0, -1]), right = quat.rot(sc.camQ, [1, 0, 0]), up = quat.rot(sc.camQ, [0, 1, 0]);
    const tanY = Math.tan(sc.fov / 2), tanX = tanY * aspect;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fComp);
    gl.viewport(0, 0, w, h);
    const pc = this.pComp.use();
    pc.tex('uCol', 0, this.tCol).tex('uNrm', 1, this.tNrm).tex('uDep', 2, this.tDep)
      .f2('uTexel', 1 / w, 1 / h).f1('uNear', near).f1('uFar', far)
      .f3('uFwd', fwd).f3('uRight', right).f3('uUp', up).f2('uTan', tanX, tanY)
      .f3('uSkyTop', sc.sky.top).f3('uSkyHor', sc.sky.hor).f3('uSkyBot', sc.sky.bot)
      .f3('uSunDir', sc.sky.sunDir).f3('uSunCol', sc.sky.sunCol).f3('uBodyUp', sc.bodyUp)
      .f4('uFog', sc.fog).f1('uEdge', sc.edge).f1('uTime', sc.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---------- 泛光 ----------
    const [w2, h2] = this.b1, [w4, h4] = this.b2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB1);
    gl.viewport(0, 0, w2, h2);
    this.pBright.use().tex('uSrc', 0, this.tComp).f2('uTexel', 1 / w, 1 / h).f1('uThresh', sc.bloomThresh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pb = this.pBlur.use();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB1b);
    pb.tex('uSrc', 0, this.tB1).f2('uDir', 1 / w2, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB1);
    pb.tex('uSrc', 0, this.tB1b).f2('uDir', 0, 1 / h2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.viewport(0, 0, w4, h4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB2b);
    pb.tex('uSrc', 0, this.tB1).f2('uDir', 1.5 / w4, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB2);
    pb.tex('uSrc', 0, this.tB2b).f2('uDir', 0, 1.5 / h4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---------- 调色 ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fLdr);
    gl.viewport(0, 0, w, h);
    this.pFinal.use().tex('uScene', 0, this.tComp).tex('uBloom1', 1, this.tB1).tex('uBloom2', 2, this.tB2)
      .f1('uBloomStr', sc.bloom).f4('uFlash', sc.flash).f1('uSat', sc.grade.sat).f1('uContrast', sc.grade.contrast)
      .f1('uVignette', sc.grade.vignette).f3('uGrade', sc.grade.tint);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---------- FXAA → 屏幕 ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    this.pFxaa.use().tex('uSrc', 0, this.tLdr).f2('uRes', w, h).f1('uTime', sc.time).f1('uGrain', sc.grain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

// 覆盖整个周期盒的正交光源矩阵
function lightMatrix(size, L) {
  const c = [size[0] / 2, size[1] / 2, size[2] / 2];
  const r = Math.hypot(size[0], size[1], size[2]) / 2 + 1;
  const f = [-L[0], -L[1], -L[2]];
  let up = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const rx = normalize3([f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]);
  const ux = [rx[1] * f[2] - rx[2] * f[1], rx[2] * f[0] - rx[0] * f[2], rx[0] * f[1] - rx[1] * f[0]];
  const eye = [c[0] + L[0] * r * 1.5, c[1] + L[1] * r * 1.5, c[2] + L[2] * r * 1.5];
  const V = new Float32Array(16);
  V[0] = rx[0]; V[4] = rx[1]; V[8] = rx[2];
  V[1] = ux[0]; V[5] = ux[1]; V[9] = ux[2];
  V[2] = -f[0]; V[6] = -f[1]; V[10] = -f[2];
  V[12] = -(rx[0] * eye[0] + rx[1] * eye[1] + rx[2] * eye[2]);
  V[13] = -(ux[0] * eye[0] + ux[1] * eye[1] + ux[2] * eye[2]);
  V[14] = (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]);
  V[15] = 1;
  const near = 0.1, far = r * 3.2;
  const P = new Float32Array(16);
  P[0] = 1 / r; P[5] = 1 / r; P[10] = -2 / (far - near); P[14] = -(far + near) / (far - near); P[15] = 1;
  return mat4.mul(P, V);
}

function boxDist2(mn, mx) {
  let d = 0;
  for (let i = 0; i < 3; i++) {
    const v = mn[i] > 0 ? mn[i] : mx[i] < 0 ? -mx[i] : 0;
    d += v * v;
  }
  return d;
}
