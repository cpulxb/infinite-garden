// WebGL2 基础工具
export function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.error(`[shader ${name}]`, log, '\n', lines);
    throw new Error(`Shader compile failed: ${name}\n${log}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vs, fs, name) {
    this.gl = gl;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${name}\n${gl.getProgramInfoLog(p)}`);
    }
    this.p = p;
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const nm = info.name.replace(/\[0\]$/, '');
      this.u[nm] = gl.getUniformLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.p); return this; }
  f1(n, v) { const l = this.u[n]; if (l) this.gl.uniform1f(l, v); return this; }
  i1(n, v) { const l = this.u[n]; if (l) this.gl.uniform1i(l, v); return this; }
  f2(n, a, b) { const l = this.u[n]; if (l) this.gl.uniform2f(l, a, b); return this; }
  f3(n, v) { const l = this.u[n]; if (l) this.gl.uniform3f(l, v[0], v[1], v[2]); return this; }
  f4(n, v) { const l = this.u[n]; if (l) this.gl.uniform4f(l, v[0], v[1], v[2], v[3]); return this; }
  f3v(n, arr) { const l = this.u[n]; if (l) this.gl.uniform3fv(l, arr); return this; }
  f1v(n, arr) { const l = this.u[n]; if (l) this.gl.uniform1fv(l, arr); return this; }
  m4(n, m) { const l = this.u[n]; if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  tex(n, unit, t) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    this.i1(n, unit);
    return this;
  }
}

export function makeTex(gl, w, h, ifmt, fmt, type, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function makeFBO(gl, colors, depth) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  const bufs = [];
  colors.forEach((t, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  gl.drawBuffers(bufs);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) console.warn('FBO incomplete', st.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

// 统一顶点格式的 VAO：location 0 pos, 1 color(归一化), 2 info(整数), 3 实例偏移
export function makeMeshVAO(gl, vbo, ibo, instBuf) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 20, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 20, 16);
  if (instBuf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(3, 1);
  }
  if (ibo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bindVertexArray(null);
  return vao;
}
