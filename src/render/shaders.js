// GLSL 着色器源码
const H = `#version 300 es
precision highp float;
precision highp int;
`;

const COMMON = `
vec3 dirN(uint d){
  if(d==0u) return vec3(1.,0.,0.);
  if(d==1u) return vec3(-1.,0.,0.);
  if(d==2u) return vec3(0.,1.,0.);
  if(d==3u) return vec3(0.,-1.,0.);
  if(d==4u) return vec3(0.,0.,1.);
  return vec3(0.,0.,-1.);
}
float h31(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = h31(i), b = h31(i+vec3(1,0,0)), c = h31(i+vec3(0,1,0)), d = h31(i+vec3(1,1,0));
  float e = h31(i+vec3(0,0,1)), g = h31(i+vec3(1,0,1)), k = h31(i+vec3(0,1,1)), l = h31(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(k,l,f.x), f.y), f.z);
}
`;

// ---------- 不透明几何（静态世界 + 动态物体），输出 G-buffer ----------
export const SOLID_VS = H + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in uvec4 aInfo;
layout(location=3) in vec3 aOff;
uniform mat4 uVP;
uniform vec3 uCam;
out vec3 vL;
out vec4 vCol;
out float vAO;
flat out uint vDir;
flat out uint vFx;
flat out uint vId;
void main(){
  vec3 w = aPos + aOff;
  vL = aPos;
  vCol = aCol;
  vAO = float(aInfo.y) / 255.0;
  vDir = aInfo.x; vFx = aInfo.z; vId = aInfo.w;
  gl_Position = uVP * vec4(w - uCam, 1.0);
}`;

export const SOLID_FS = H + COMMON + `
in vec3 vL;
in vec4 vCol;
in float vAO;
flat in uint vDir;
flat in uint vFx;
flat in uint vId;
uniform vec3 uGrav[6];
uniform float uTint;
uniform float uFace[6];
uniform float uTime;
uniform float uAoStr;
uniform vec3 uAmb;
uniform highp sampler2DShadow uShadow;
uniform mat4 uLightVP;
uniform vec3 uLightDir;
uniform float uShadowOn;
uniform float uShadowTexel;
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oNrm;
void main(){
  vec3 n = dirN(vDir);
  uint ax = vDir >> 1u;
  vec2 uv = ax == 0u ? vL.yz : (ax == 1u ? vL.zx : vL.xy);
  vec3 base = vCol.rgb;
  float emis = vCol.a;
  float lit = uFace[vDir];
  float ao = vAO; ao = ao*ao*(3.0-2.0*ao);
  float aoF = mix(1.0 - uAoStr, 1.0, ao);
  float pat = 1.0;
  bool tinted = false;
  vec3 cellP = floor(vL - n*0.02);
  if (vFx == 0u || vFx == 1u || vFx == 9u) {
    tinted = true;
    pat *= 0.985 + 0.03 * h31(cellP);
    if (vFx == 1u) {
      vec2 g = abs(fract(uv * 0.5) - 0.5);
      pat *= 1.0 - 0.075 * smoothstep(0.465, 0.49, max(g.x, g.y));
    }
    if (vFx == 9u) {
      vec2 g = abs(fract(uv * 0.5 + 0.25) - 0.5);
      pat *= 1.0 - 0.12 * smoothstep(0.44, 0.48, max(g.x, g.y));
    }
  } else if (vFx == 2u) {
    float nn = vnoise(vL * 2.7) * 0.6 + vnoise(vL * 7.1) * 0.4;
    base *= 0.82 + 0.34 * nn;
  } else if (vFx == 3u) {
    emis *= 0.78 + 0.22 * sin(uTime * 1.6 + dot(vL, vec3(0.7, 0.3, 0.5)));
  } else if (vFx == 6u) {
    float w1 = sin(dot(vL, vec3(2.3, 1.7, 2.9)) * 1.7 - uTime * 2.6) * 0.5 + 0.5;
    float w2 = vnoise(vL * 1.3 + vec3(0.0, uTime * 0.6, 0.0));
    base = mix(base, vec3(1.0), 0.35 * w1 + 0.25 * w2);
    lit = 1.0; aoF = 1.0;
  } else if (vFx == 7u) {
    base *= 0.9 + 0.2 * h31(floor(vL * 3.0));
  } else if (vFx == 8u) {
    base *= 0.9 + 0.12 * vnoise(vL * vec3(9.0, 1.5, 9.0));
  } else if (vFx == 10u) {
    emis *= 0.6 + 0.4 * sin(uTime * 3.2 + dot(vL, vec3(1.0)));
  }
  // 投射阴影：只作用于朝向光源的面
  float ndl = dot(n, uLightDir);
  if (uShadowOn > 0.5 && ndl > 0.05 && vFx != 6u) {
    vec4 lc = uLightVP * vec4(vL + n * 0.09, 1.0);
    vec3 sc = lc.xyz / lc.w * 0.5 + 0.5;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float sh = 0.0;
      float r = uShadowTexel * 1.5;
      for (int i = -1; i <= 1; i++)
        for (int j = -1; j <= 1; j++)
          sh += texture(uShadow, vec3(sc.xy + vec2(float(i), float(j)) * r, sc.z - 0.002));
      sh /= 9.0;
      lit *= mix(0.52, 1.0, sh);
    }
  }
  if (tinted) {
    vec3 gc = uGrav[vDir ^ 1u];
    base *= mix(vec3(1.0), gc / max(max(gc.r, gc.g), max(gc.b, 1e-3)), uTint);
  }
  vec3 col = base * lit * aoF * pat;
  // 背光面与角落染上天空色，形成冷暖对比
  vec3 amb = uAmb / max(max(uAmb.r, uAmb.g), max(uAmb.b, 1e-3));
  col *= mix(vec3(1.0), amb, clamp((1.0 - lit * aoF) * 0.85, 0.0, 1.0));
  col += base * emis * 1.5;
  oCol = vec4(col, emis);
  oNrm = vec4(n * 0.5 + 0.5, float(vId) / 255.0);
}`;

// ---------- 阴影贴图（局部坐标，所有世界副本共享） ----------
export const SHADOW_VS = H + `
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main(){ gl_Position = uLightVP * vec4(aPos, 1.0); }`;
export const SHADOW_FS = H + `
out vec4 o;
void main(){ o = vec4(1.0); }`;

// ---------- 半透明（水、接触阴影） ----------
export const TRANS_VS = H + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in uvec4 aInfo;
layout(location=3) in vec3 aOff;
uniform mat4 uVP;
uniform vec3 uCam;
out vec3 vL;
out vec3 vRel;
out vec4 vCol;
flat out uint vDir;
flat out uint vFlow;
flat out uint vFx;
invariant gl_Position;
void main(){
  vec3 w = aPos + aOff;
  vL = aPos; vRel = w - uCam;
  vCol = aCol;
  vDir = aInfo.x; vFlow = aInfo.y; vFx = aInfo.z;
  gl_Position = uVP * vec4(w - uCam, 1.0);
}`;

export const TRANS_FS = H + COMMON + `
in vec3 vL;
in vec3 vRel;
in vec4 vCol;
flat in uint vDir;
flat in uint vFlow;
flat in uint vFx;
uniform float uTime;
uniform vec3 uWaterDeep;
uniform vec3 uWaterLight;
uniform vec3 uSkyHor;
uniform int uMode;
layout(location=0) out vec4 oCol;
void main(){
  if (vFx == 3u) { oCol = vec4(0.0, 0.0, 0.0, vCol.a); return; }
  if (vFx == 5u) {
    float fl = 0.75 + 0.25 * sin(uTime * 2.4 + dot(vL, vec3(3.1, 2.3, 1.7)));
    oCol = vec4(vCol.rgb * 1.35 * fl, vCol.a * fl);
    return;
  }
  vec3 n = dirN(vDir);
  if (uMode == 0) { oCol = vec4(n * 0.5 + 0.5, 245.0 / 255.0); return; }
  vec3 fd = vFlow < 6u ? dirN(vFlow) : vec3(0.0, 0.0, 0.0);
  vec3 V = normalize(vRel);
  float s = dot(vL, fd);
  vec3 q = vL - fd * s;
  float stripes;
  if (vFx == 1u) {
    stripes = vnoise(vec3(q * 5.0) + fd * (s * 1.2 - uTime * 7.5)) * 0.7
            + vnoise(vec3(q * 11.0) + fd * (s * 2.5 - uTime * 10.0)) * 0.3;
  } else {
    stripes = vnoise(vec3(q * 2.6) + fd * (s * 1.6 - uTime * 2.2)) * 0.65
            + vnoise(vec3(q * 6.0) + fd * (s * 3.0 - uTime * 3.4) + vec3(0.0, uTime * 0.3, 0.0)) * 0.35;
  }
  float fres = pow(1.0 - abs(dot(V, n)), 3.0);
  vec3 col = mix(uWaterDeep, uWaterLight, 0.2 + 0.65 * stripes);
  col = mix(col, uSkyHor * 1.05, fres * 0.45);
  float glint = smoothstep(0.72, 0.9, stripes);
  col += vec3(1.0) * glint * 0.25;
  float a = vFx == 1u ? 0.78 : 0.82;
  oCol = vec4(col * vCol.rgb, clamp(a + fres * 0.15, 0.0, 0.95));
}`;

// ---------- 漂浮微尘 ----------
export const PART_VS = H + `
layout(location=0) in vec4 aP;
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uPx;
uniform float uTime;
out float vA;
void main(){
  vec3 rel = aP.xyz - uCam;
  gl_Position = uVP * vec4(rel, 1.0);
  float d = max(length(rel), 0.3);
  float tw = 0.6 + 0.4 * sin(uTime * 1.3 + aP.w * 37.0);
  gl_PointSize = clamp(uPx * (0.035 + 0.03 * fract(aP.w * 7.0)) / d, 1.0, 24.0);
  vA = tw * smoothstep(16.0, 6.0, d) * smoothstep(0.3, 1.2, d);
}`;

export const PART_FS = H + `
in float vA;
uniform vec3 uPartCol;
layout(location=0) out vec4 oCol;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r) * vA;
  oCol = vec4(uPartCol * a * 0.9, 0.0);
}`;

// ---------- 全屏通道 ----------
export const FS_VS = H + `
const vec2 P[3] = vec2[](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUV;
void main(){
  vec2 p = P[gl_VertexID];
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// 合成：描边 + 距离雾 + 天空
export const COMPOSITE_FS = H + `
in vec2 vUV;
uniform sampler2D uCol;
uniform sampler2D uNrm;
uniform sampler2D uDep;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uTan;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uSkyBot;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uBodyUp;
uniform vec4 uFog;
uniform float uEdge;
uniform float uTime;
out vec4 o;

float linz(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float invz(float d){ return d >= 0.99999 ? 0.0 : 1.0 / linz(d); }
float nh(vec3 n){ return dot(n, vec3(1.0, 2.0, 4.0)); }

vec3 skyCol(vec3 rd){
  float h = dot(rd, uBodyUp);
  vec3 c = h > 0.0 ? mix(uSkyHor, uSkyTop, pow(clamp(h, 0.0, 1.0), 0.55))
                   : mix(uSkyHor, uSkyBot, pow(clamp(-h, 0.0, 1.0), 0.65));
  float s = max(dot(rd, uSunDir), 0.0);
  c += uSunCol * (pow(s, 5.0) * 0.16 + pow(s, 48.0) * 0.3 + smoothstep(0.9990, 0.9996, s) * 0.9);
  return c;
}

void main(){
  vec3 rd = normalize(uFwd + (vUV.x * 2.0 - 1.0) * uTan.x * uRight + (vUV.y * 2.0 - 1.0) * uTan.y * uUp);
  vec3 sky = skyCol(rd);
  float d = texture(uDep, vUV).r;
  if (d >= 0.99999) { o = vec4(sky, 0.0); return; }
  vec4 c4 = texture(uCol, vUV);
  vec3 col = c4.rgb;
  float emis = c4.a;
  vec4 nc = texture(uNrm, vUV);
  vec3 n0 = nc.xyz * 2.0 - 1.0;
  float w0 = invz(d);
  float z0 = 1.0 / w0;

  // 深度：1/z 的二阶差分（平面上恒为 0，只在轮廓处跳变），只标记靠近相机的一侧
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  float wl = invz(texture(uDep, vUV - tx).r), wr = invz(texture(uDep, vUV + tx).r);
  float wd = invz(texture(uDep, vUV - ty).r), wu = invz(texture(uDep, vUV + ty).r);
  float lx = (2.0 * w0 - wl - wr) / w0;
  float ly = (2.0 * w0 - wd - wu) / w0;
  float eD = max(smoothstep(0.06, 0.16, lx), smoothstep(0.06, 0.16, ly));

  // 法线 / 物体编号：只在“编号较大”的一侧画线，得到 1 像素线条
  float eN = 0.0;
  vec2 offs[4] = vec2[](tx, -tx, ty, -ty);
  for (int i = 0; i < 4; i++) {
    vec4 ns = texture(uNrm, vUV + offs[i]);
    vec3 nn = ns.xyz * 2.0 - 1.0;
    float dn = 1.0 - dot(n0, nn);
    if (dn > 0.3 && nh(n0) > nh(nn)) eN = 1.0;
    if (abs(nc.a - ns.a) > 0.002 && nc.a > ns.a) eN = 1.0;
  }
  float e = max(eD, eN);
  float dist = z0 / max(dot(rd, uFwd), 0.05);
  e *= smoothstep(0.15, 0.6, dist);
  col *= 1.0 - e * uEdge;

  float f = 1.0 - exp(-pow(max(dist - uFog.x, 0.0) / uFog.y, uFog.z));
  f = clamp(f * uFog.w, 0.0, 1.0);
  col = mix(col, sky, f);
  o = vec4(col, emis * (1.0 - f));
}`;

// 泛光：提取亮部（含 4 点下采样）
export const BRIGHT_FS = H + `
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThresh;
out vec4 o;
void main(){
  vec3 acc = vec3(0.0);
  vec2 offs[4] = vec2[](vec2(-0.5,-0.5), vec2(0.5,-0.5), vec2(-0.5,0.5), vec2(0.5,0.5));
  for (int i = 0; i < 4; i++) {
    vec4 c = texture(uSrc, vUV + offs[i] * uTexel);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float k = max(c.a, smoothstep(uThresh, uThresh + 0.5, l));
    acc += c.rgb * k;
  }
  o = vec4(acc * 0.25, 1.0);
}`;

export const BLUR_FS = H + `
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uDir;
out vec4 o;
void main(){
  vec3 c = texture(uSrc, vUV).rgb * 0.2270270270;
  c += texture(uSrc, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

// 最终：泛光叠加 + 柔和高光压缩 + 调色 + 暗角
export const FINAL_FS = H + `
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uBloomStr;
uniform vec4 uFlash;
uniform float uSat;
uniform float uContrast;
uniform float uVignette;
uniform vec3 uGrade;
out vec4 o;
vec3 knee(vec3 x){
  const float k = 0.82;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom1, vUV).rgb * 0.6 + texture(uBloom2, vUV).rgb * 0.8;
  c += b * uBloomStr;
  c = mix(c, uFlash.rgb, uFlash.a);
  c = knee(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= uGrade;
  vec2 q = vUV - 0.5;
  float v = 1.0 - dot(q, q) * uVignette;
  c *= v;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// FXAA + 胶片颗粒
export const FXAA_FS = H + `
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uGrain;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 inv = 1.0 / uRes;
  vec2 fc = vUV * uRes;
  vec3 nw = texture(uSrc, (fc + vec2(-1.0, -1.0)) * inv).rgb;
  vec3 ne = texture(uSrc, (fc + vec2(1.0, -1.0)) * inv).rgb;
  vec3 sw = texture(uSrc, (fc + vec2(-1.0, 1.0)) * inv).rgb;
  vec3 se = texture(uSrc, (fc + vec2(1.0, 1.0)) * inv).rgb;
  vec3 m = texture(uSrc, vUV).rgb;
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
  float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * inv;
  vec3 a = 0.5 * (texture(uSrc, vUV + dir * (1.0/3.0 - 0.5)).rgb + texture(uSrc, vUV + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uSrc, vUV - dir * 0.5).rgb + texture(uSrc, vUV + dir * 0.5).rgb);
  float lb = dot(b, L);
  vec3 c = (lb < lmin || lb > lmax) ? a : b;
  float g = hash(fc + fract(uTime * 13.37) * 100.0) - 0.5;
  c += g * uGrain;
  o = vec4(c, 1.0);
}`;
