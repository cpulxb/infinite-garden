// DOM 界面：标题、HUD、菜单、设置、庭院选择、结局
import { GRAV_HEX, GRAV_NAME, GRAV_DESC } from '../game/constants.js';

const $ = (s) => document.querySelector(s);

export const SETTINGS_DEF = [
  { key: 'sens', label: '鼠标灵敏度', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'fov', label: '视野', min: 60, max: 105, step: 1, fmt: (v) => v + '°' },
  { key: 'quality', label: '渲染精度', min: 0.4, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'repeat', label: '无限层数', min: 1, max: 4, step: 1, fmt: (v) => v },
  { key: 'master', label: '总音量', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'music', label: '音乐', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'sfx', label: '音效', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) },
  { key: 'invertY', label: '反转 Y 轴', toggle: true },
  { key: 'hints', label: '提示', toggle: true },
  { key: 'fps', label: '性能信息', toggle: true },
];

export class UI {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.el = {
      title: $('#title'), hud: $('#hud'), pause: $('#pause'), gardens: $('#gardens'),
      settings: $('#settings'), controls: $('#controls'), resume: $('#resume'), ending: $('#ending'),
      fade: $('#fade'), boot: $('#boot'), cross: $('#crosshair'), hint: $('#hint'), card: $('#card'),
      label: $('#garden-label'), gravSvg: $('#grav-svg'), gravName: $('#grav-name'), tip: $('#action-tip'),
      debug: $('#debug'),
    };
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.audio.ui();
        this.app.action(b.dataset.act);
      });
    });
    this.el.resume.addEventListener('click', () => this.app.action('resume'));
    this.buildGrav();
    this.hintTimer = 0;
    this.cardTimer = 0;
    this.curHint = '';
  }

  // ---------- 屏幕切换 ----------
  only(names) {
    for (const k of ['title', 'hud', 'pause', 'gardens', 'settings', 'controls', 'resume', 'ending']) {
      this.el[k].hidden = !names.includes(k);
    }
    // 触屏按钮只在游戏进行中显示
    const t = document.getElementById('touch');
    if (t) t.hidden = !(this.app.input.isTouch && names.length === 1 && names[0] === 'hud');
  }
  openSub(name) {
    this.stack.push(this.current || 'title');
    this.current = name;
    if (name === 'gardens') this.renderGardens();
    if (name === 'settings') this.renderSettings();
    const base = this.app.mode === 'title' ? ['title'] : ['hud'];
    this.only([...base.filter((x) => x !== 'title'), name]);
  }
  back() {
    const prev = this.stack.pop() || 'title';
    this.current = prev;
    if (prev === 'title') this.only(['title']);
    else if (prev === 'pause') this.only(['hud', 'pause']);
    else this.only([prev]);
  }
  showTitle() {
    this.stack = []; this.current = 'title';
    this.only(['title']);
    const save = this.app.save;
    const btn = $('#btn-continue');
    const lv = this.app.levels[save.current] || this.app.levels[0];
    btn.disabled = !save.started;
    btn.querySelector('em').textContent = save.started ? `${lv.title} · ${lv.name}` : '';
  }
  showHud() { this.stack = []; this.current = 'hud'; this.only(['hud']); }
  showPause() {
    this.stack = []; this.current = 'pause';
    const lv = this.app.game.levelDef;
    $('#pause-idx').textContent = lv ? lv.title : '';
    $('#pause-name').textContent = lv ? lv.name : '暂停';
    this.only(['hud', 'pause']);
  }
  showResume() { this.only(['hud', 'resume']); this.current = 'resume'; }
  bootDone() { this.el.boot.classList.add('gone'); setTimeout(() => (this.el.boot.hidden = true), 1100); }

  fade(to, ms = 1200) {
    this.el.fade.style.transition = `opacity ${ms}ms ease`;
    this.el.fade.style.opacity = to;
  }

  // ---------- 庭院选择 ----------
  renderGardens() {
    const grid = $('#garden-grid');
    grid.innerHTML = '';
    const save = this.app.save;
    this.app.levels.forEach((lv, i) => {
      const done = save.done.includes(lv.id);
      const locked = i > save.unlocked;
      const b = document.createElement('button');
      b.className = 'gcard' + (done ? ' done' : '') + (locked ? ' locked' : '');
      const sw = this.app.paletteSwatch(lv.palette);
      b.style.setProperty('--sw', sw);
      b.innerHTML = `<span class="gc-idx">${lv.title}</span><span class="gc-name">${lv.name}</span><span class="gc-en">${lv.en}</span><span class="gc-poem">${locked ? '尚未抵达' : lv.poem}</span><span class="gc-state">${done ? '已完成' : locked ? '' : '可进入'}</span><span class="gc-swatch"></span>`;
      b.addEventListener('click', () => { this.app.audio.ui(); this.app.action('goto', i); });
      grid.appendChild(b);
    });
  }

  // ---------- 设置 ----------
  renderSettings() {
    const body = $('#settings-body');
    body.innerHTML = '';
    const s = this.app.settings;
    for (const d of SETTINGS_DEF) {
      const row = document.createElement('div');
      row.className = 'setting';
      if (d.toggle) {
        row.innerHTML = `<label>${d.label}</label><button class="toggle ${s[d.key] ? 'on' : ''}">${s[d.key] ? '开' : '关'}</button><output></output>`;
        const t = row.querySelector('button');
        t.addEventListener('click', () => {
          s[d.key] = !s[d.key];
          t.classList.toggle('on', s[d.key]);
          t.textContent = s[d.key] ? '开' : '关';
          this.app.applySettings();
        });
      } else {
        row.innerHTML = `<label>${d.label}</label><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${s[d.key]}"><output>${d.fmt(s[d.key])}</output>`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        inp.addEventListener('input', () => {
          s[d.key] = parseFloat(inp.value);
          out.textContent = d.fmt(s[d.key]);
          this.app.applySettings();
        });
      }
      body.appendChild(row);
    }
  }

  // ---------- HUD ----------
  setLabel(lv) {
    this.el.label.querySelector('.g-idx').textContent = lv.title || '';
    this.el.label.querySelector('.g-name').textContent = lv.name || '';
  }
  setCrosshair(state, color) {
    const c = this.el.cross;
    if (c.dataset.state !== state) c.dataset.state = state;
    const col = color ?? '#ffffff';
    if (this._cc !== col) { c.style.setProperty('--c', col); this._cc = col; }
  }
  setTip(text) {
    text = this.touchText(text);
    if (this._tip === text) return;
    this._tip = text;
    this.el.tip.textContent = text || '';
    this.el.tip.classList.toggle('on', !!text);
  }
  // 触屏设备上把键鼠说明替换为按钮说明
  touchText(t) {
    if (!this.app.input.isTouch || !t) return t;
    return t
      .replace('移动鼠标环顾 · WASD 行走 · 空格 跳跃', '右侧滑动环顾 · 左侧拖动行走 · 「跳」跳跃')
      .replace(/<b>鼠标右键<\/b> 或 <b>F<\/b>/g, '<b>重力</b> 按钮')
      .replace(/<b>鼠标左键<\/b> 或 <b>E<\/b>/g, '<b>拿取</b> 按钮')
      .replace('再按一次 <b>R</b> 重置此庭院。', '再按一次重置此庭院。')
      .replace(/^右键 · /, '重力 · ')
      .replace(/^左键 · /, '拿取 · ');
  }
  hint(html, dur = 8) {
    if (!this.app.settings.hints) return;
    html = this.touchText(html);
    const h = this.el.hint;
    h.querySelector('span').innerHTML = html;
    h.classList.add('on');
    this.hintTimer = dur;
    this.curHint = html;
  }
  hideHint() { this.el.hint.classList.remove('on'); this.hintTimer = 0; }
  card(lv) {
    const c = this.el.card;
    c.querySelector('.card-idx').textContent = lv.title;
    c.querySelector('.card-name').textContent = lv.name;
    c.querySelector('.card-en').textContent = lv.en;
    c.querySelector('.card-poem').textContent = lv.poem;
    c.classList.add('on');
    this.cardTimer = 5.5;
  }
  update(dt) {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('on');
    }
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.el.card.classList.remove('on');
    }
  }

  buildGrav() {
    // 六个菱形围成一圈；当前重力的菱形放大并居中显示名字
    const svg = this.el.gravSvg;
    const order = [3, 0, 4, 2, 1, 5];
    let html = '<circle r="21" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.8"/>';
    order.forEach((d, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * 21, y = Math.sin(a) * 21;
      html += `<rect class="gd" data-d="${d}" x="${x - 3.6}" y="${y - 3.6}" width="7.2" height="7.2" fill="${GRAV_HEX[d]}" stroke="rgba(255,255,255,0.9)" stroke-width="0.8" transform="rotate(45 ${x} ${y})" opacity="0.55"/>`;
    });
    html += '<g id="grav-core"><rect x="-8" y="-8" width="16" height="16" transform="rotate(45)" fill="none" stroke="#fff" stroke-width="1.2"/><rect id="grav-fill" x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="#fff"/></g>';
    svg.innerHTML = html;
    this.gd = [...svg.querySelectorAll('.gd')];
    this.gfill = svg.querySelector('#grav-fill');
  }
  setGrav(g) {
    if (this._g === g) return;
    this._g = g;
    for (const r of this.gd) {
      const on = +r.dataset.d === g;
      r.setAttribute('opacity', on ? '1' : '0.45');
      r.style.transform = on ? 'scale(1.45)' : 'scale(1)';
    }
    this.gfill.setAttribute('fill', GRAV_HEX[g]);
    this.el.gravName.textContent = GRAV_DESC[g];
  }
  debug(text) {
    const d = this.el.debug;
    d.hidden = !text;
    if (text) d.textContent = text;
  }

  // ---------- 结局 ----------
  ending(lines, onDone) {
    this.only(['ending']);
    const box = $('#ending-lines');
    box.innerHTML = '';
    const els = lines.map((l) => {
      const d = document.createElement('div');
      d.className = 'el ' + (l.cls || '');
      d.textContent = l.text;
      box.appendChild(d);
      return d;
    });
    let t = 0;
    lines.forEach((l, i) => {
      t += l.delay ?? 2.6;
      setTimeout(() => els[i].classList.add('on'), t * 1000);
    });
    setTimeout(onDone, (t + 7) * 1000);
  }
}

export { GRAV_NAME };
