// 入口：应用状态机（标题 / 游戏 / 暂停 / 过场 / 结局）、存档与主循环
import { Renderer } from './render/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { Input } from './core/input.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { LEVELS, TITLE_LEVEL } from './world/levels.js';
import { PALETTES } from './world/palettes.js';
import { quat, v3, clamp } from './core/math.js';
import { installTestKit } from './debug.js';

const SAVE_KEY = 'infinite-garden-save-v1';
const DEFAULT_SETTINGS = {
  sens: 1, fov: 78, quality: 1, repeat: 3, master: 0.8, music: 0.55, sfx: 0.8,
  invertY: false, hints: true, fps: false,
};

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') {
      return {
        started: !!s.started, current: s.current | 0, unlocked: s.unlocked | 0, done: Array.isArray(s.done) ? s.done : [],
        settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
      };
    }
  } catch (e) { /* 忽略损坏的存档 */ }
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
  return { started: false, current: 0, unlocked: 0, done: [], settings: { ...DEFAULT_SETTINGS, quality: lowPower ? 0.7 : 1, repeat: lowPower ? 2 : 3 } };
}

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.levels = LEVELS;
    this.save = loadSave();
    this.settings = this.save.settings;
    this.renderer = new Renderer(this.canvas);
    this.audio = new AudioEngine();
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.game = new Game(this);
    this.mode = 'boot';
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 0;
    this.endT = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    // 首次交互时启动音频
    const kick = () => { this.audio.init(); this.applySettings(); };
    addEventListener('pointerdown', kick, { capture: true });
    addEventListener('keydown', kick, { capture: true });
    addEventListener('touchstart', kick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause();
    });
  }

  resize() {
    this.renderer.resize(innerWidth, innerHeight, this.settings.quality * (this.dynScale || 1));
  }

  // 帧时间过长时自动降低渲染分辨率，富余时再逐步恢复
  adapt(rawDt) {
    if (this.mode !== 'play' && this.mode !== 'title') { this.slowT = 0; this.fastT = 0; return; }
    if (rawDt > 0.2) return;
    this.ema = this.ema ? this.ema * 0.95 + rawDt * 0.05 : rawDt;
    this.dynScale = this.dynScale || 1;
    if (this.ema > 1 / 42) { this.slowT = (this.slowT || 0) + rawDt; this.fastT = 0; }
    else if (this.ema < 1 / 70) { this.fastT = (this.fastT || 0) + rawDt; this.slowT = 0; }
    else { this.slowT = 0; this.fastT = 0; }
    if (this.slowT > 2 && this.dynScale > 0.5) { this.dynScale = Math.max(0.5, this.dynScale * 0.85); this.slowT = 0; this.resize(); }
    if (this.fastT > 6 && this.dynScale < 1) { this.dynScale = Math.min(1, this.dynScale / 0.9); this.fastT = 0; this.resize(); }
  }

  applySettings() {
    const s = this.settings;
    this.audio.vol = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolume();
    this.resize();
    this.persist();
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  paletteSwatch(name) { return PALETTES[name]?.sky?.top || '#888'; }

  start() {
    this.toTitle(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    setTimeout(() => this.ui.bootDone(), 300);
  }

  toTitle(first = false) {
    this.mode = 'title';
    this.input.unlock();
    this.game.load(TITLE_LEVEL, -1);
    this.game.titleT = 0;
    this.ui.showTitle();
    this.ui.fade(0, first ? 1800 : 1200);
  }

  // UI 按钮动作
  action(act, arg) {
    switch (act) {
      case 'new':
        this.save.started = true; this.save.current = 0;
        this.persist();
        this.begin(0);
        break;
      case 'continue':
        this.begin(Math.min(this.save.current, this.levels.length - 1));
        break;
      case 'goto':
        this.save.started = true; this.save.current = arg; this.persist();
        this.begin(arg);
        break;
      case 'gardens': case 'settings': case 'controls':
        this.ui.openSub(act);
        break;
      case 'back':
        this.ui.back();
        break;
      case 'resume':
        if (this.mode === 'pause' || this.mode === 'play') {
          this.mode = 'play';
          this.ui.showHud();
          this.input.clearEvents();
          this.input.lock();
        }
        break;
      case 'reset':
        if (this.game.levelIndex >= 0) this.begin(this.game.levelIndex, true);
        break;
      case 'title':
        this.ui.fade(1, 600);
        this.mode = 'transition';
        setTimeout(() => this.toTitle(), 650);
        break;
    }
  }

  begin(index, quick = false) {
    this.audio.init();
    this.input.lock();
    this.mode = 'transition';
    this.ui.fade(1, quick ? 350 : 800);
    setTimeout(() => {
      this.game.load(this.levels[index], index);
      this.save.current = index; this.save.started = true;
      this.persist();
      this.mode = 'play';
      this.ui.showHud();
      this.input.clearEvents();
      this.ui.fade(0, quick ? 600 : 1600);
      if (!quick) setTimeout(() => this.ui.card(this.levels[index]), 500);
      if (!this.input.locked && !this.input.isTouch) this.input.lock();
    }, quick ? 380 : 850);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.input.unlock();
    this.ui.showPause();
  }

  onLevelComplete() {
    const i = this.game.levelIndex;
    const lv = this.levels[i];
    if (!this.save.done.includes(lv.id)) this.save.done.push(lv.id);
    this.save.unlocked = Math.max(this.save.unlocked, i + 1);
    const next = i + 1;
    this.save.current = Math.min(next, this.levels.length - 1);
    this.persist();
    this.mode = 'transition';
    this.ui.fade(1, 1500);
    if (next < this.levels.length) {
      setTimeout(() => {
        this.game.load(this.levels[next], next);
        this.mode = 'play';
        this.input.clearEvents();
        this.ui.fade(0, 1800);
        setTimeout(() => this.ui.card(this.levels[next]), 600);
      }, 1700);
    } else {
      setTimeout(() => this.startEnding(), 1700);
    }
  }

  startEnding() {
    this.mode = 'ending';
    this.input.unlock();
    this.game.load(TITLE_LEVEL, -1);
    this.endT = 0;
    this.ui.fade(0, 3000);
    this.ui.ending([
      { text: '你走过的每一座庭院', delay: 3 },
      { text: '都在彼此之中，无限重复。', delay: 2.4 },
      { text: '无限庭院', cls: 'big', delay: 4 },
      { text: 'AN HTML HOMAGE TO MANIFOLD GARDEN', cls: 'small', delay: 2 },
      { text: '感谢游玩', delay: 3 },
    ], () => {
      this.ui.fade(1, 1500);
      setTimeout(() => this.toTitle(), 1600);
    });
  }

  frame(now) {
    const raw = (now - this.last) / 1000;
    const dt = clamp(raw, 0, 0.05);
    this.last = now;
    this.adapt(raw);
    try {
      this.tick(dt);
    } catch (e) {
      console.error(e);
      this.showError(e);
      return;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  tick(dt) {
    const g = this.game, inp = this.input;
    this.ui.update(dt);
    if (this.mode === 'play') {
      if (inp.consume('pause') || inp.consume('unlocked')) { this.pause(); }
      else if (inp.consume('click')) inp.lock();
      if (this.mode === 'play') g.update(dt);
    } else if (this.mode === 'pause') {
      inp.look();
      if (inp.consume('pause')) this.action('resume');
      inp.events.delete('click'); inp.events.delete('unlocked');
      g.audio.update(dt, { waterDist: g.water.nearest, fallSpeed: 0 });
    } else if (this.mode === 'title' || this.mode === 'ending') {
      inp.look();
      inp.clearEvents();
      g.updateTitle(dt);
    } else if (this.mode === 'transition') {
      inp.look();
      if (g.levelIndex >= 0) g.update(dt * 0.6);
      else g.updateTitle(dt);
    }

    let cam;
    if (this.mode === 'title' || ((this.mode === 'transition') && g.levelIndex < 0)) {
      const tc = g.titleCamera();
      cam = { pos: tc.pos, q: tc.q, up: tc.up, bodyQ: [0, 0, 0, 1], fov: 70 * Math.PI / 180, maxR: 4 };
    } else if (this.mode === 'ending') {
      this.endT += dt;
      const tc = g.titleCamera();
      const back = quat.rot(tc.q, [0, 0, 1]);
      const k = Math.pow(this.endT, 1.6) * 0.9;
      cam = { pos: v3.madd(tc.pos, back, k), q: tc.q, up: tc.up, bodyQ: [0, 0, 0, 1], fov: 70 * Math.PI / 180, fogMul: 1 + this.endT * 0.05, maxR: 5 };
    } else {
      cam = g.playCamera();
    }
    g.render(cam);

    // 性能信息
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    if (inp.consume('debug')) this.settings.fps = !this.settings.fps;
    if (this.settings.fps && (this.mode === 'play' || this.mode === 'pause')) {
      const p = g.player, st = this.renderer.stats;
      this.ui.debug(`${this.fps.toFixed(0)} fps  ·  ${st.copies} copies  ·  ${(st.tris / 1e6).toFixed(2)}M tris\n` +
        `pos ${p.pos.map((v) => v.toFixed(1)).join(', ')}  grav ${p.grav}  ${p.grounded ? 'ground' : 'air'}\n` +
        `render ${this.renderer.w}×${this.renderer.h}  water ${g.water.present.size}`);
    } else this.ui.debug('');
  }

  showError(e) {
    const el = document.getElementById('error');
    el.hidden = false;
    el.innerHTML = `庭院坍塌了。<br><small>${String(e && e.message || e).replace(/</g, '&lt;')}</small><br><small>请刷新页面重试。</small>`;
  }
}

function boot() {
  try {
    const app = new App();
    window.__IG = app;
    installTestKit(app);
    app.start();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('error');
    el.hidden = false;
    el.innerHTML = `无法启动：${String(e && e.message || e)}<br><small>本作需要支持 WebGL2 的现代浏览器。</small>`;
    document.getElementById('boot').hidden = true;
  }
}
boot();
