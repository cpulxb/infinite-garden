// 庭院定义。坐标约定：box(x0,y0,z0, x1,y1,z1) 左闭右开；y 为默认“上”。
// 重力编号：0:+X 翠  1:-X 紫  2:+Y 金  3:-Y 赤  4:+Z 青  5:-Z 蓝
import { M } from './builder.js';

const inBox = (p, b) => p[0] >= b[0] && p[0] < b[3] && p[1] >= b[1] && p[1] < b[4] && p[2] >= b[2] && p[2] < b[5];

// 远处的漂浮装饰（只放在不影响谜题的角落柱区）
function cornerIslands(b, seed, y0 = 4, y1 = 36) {
  const S = b.size;
  b.scatter(seed, 10, [0, y0, 0, 4, y1, 4], 2, M.PANEL);
  b.scatter(seed + 1, 6, [S[0] - 4, y0, 0, S[0] - 1, y1, 4], 2, M.TRIM);
  b.scatter(seed + 2, 6, [0, y0, S[2] - 4, 4, y1, S[2] - 1], 2, M.DARK);
}

export const LEVELS = [
  // ───────────────────────── 第一庭院 · 初醒 ─────────────────────────
  {
    id: 'awakening', title: '第一庭院', name: '初醒', en: 'AWAKENING',
    poem: '墙，也可以是地面。',
    palette: 'dawn', size: [40, 40, 40],
    build(b) {
      b.platform(6, 14, 18, 26, 16, 4, M.STONE, 3);
      b.platform(26, 14, 34, 26, 16, 4, M.STONE, 3);
      // 横跨裂隙的高墙
      b.box(6, 10, 26, 34, 26, 28, M.PANEL);
      b.box(6, 26, 26, 34, 27, 28, M.TRIM);
      b.box(8, 6, 26, 32, 10, 28, M.DARK);
      for (const x of [9, 15, 21, 27, 31]) b.lamp(x, 23, 26);
      // 起点：柱廊与台阶
      for (let x = 7; x < 18; x += 3) b.box(x, 16, 14, x + 1, 20, 15, M.TRIM);
      b.box(6, 20, 14, 18, 21, 15, M.TRIM);
      b.box(7, 16, 20, 12, 17, 25, M.PANEL);
      b.stairs(13, 16, 20, 1, 2, 2, 4, 5, M.PANEL);
      b.decoTree(9, 17, 23, 3, { hue: '#e9a27c', seed: 11 });
      // 终点：光门
      b.box(31, 16, 17, 32, 22, 18, M.TRIM);
      b.box(31, 16, 22, 32, 22, 23, M.TRIM);
      b.box(31, 22, 17, 32, 23, 23, M.TRIM);
      b.lamp(31, 22, 19); b.lamp(31, 22, 20);
      b.portal(31, 16, 18, 32, 22, 22, { axis: 0 });
      b.decoTree(28, 16, 24, 3, { hue: '#9fc17a', seed: 5, scale: 0.8 });
      // 远景
      b.frame(2, 20, 20, 6, 0, 1, M.TRIM);
      cornerIslands(b, 101);
      b.spawnAt(9.5, 16, 19.5, -90);
    },
    hints: [
      { text: '移动鼠标环顾 · WASD 行走 · 空格 跳跃', when: () => true, dur: 7 },
      { text: '裂隙太宽，无法跳过。看向身旁的高墙，按 <b>鼠标右键</b> 或 <b>F</b> 改变重力。', when: (G) => G.p.grav === 3 && G.p.pos[0] > 14 && G.p.pos[0] < 19 && !G.flags.shifted },
      { text: '高墙成了地面。沿着它，走过裂隙。', when: (G) => G.p.grav === 4 },
      { text: '看向平台的地面，再次改变重力。', when: (G) => G.p.grav === 4 && G.p.pos[0] > 25 },
      { text: '走进光门。', when: (G) => G.p.grav === 3 && G.p.pos[0] > 26 },
      { text: '坠入虚空并不可怕——世界会把你送回来。', when: (G) => G.flags.respawned, dur: 6 },
    ],
  },

  // ───────────────────────── 第二庭院 · 坠落 ─────────────────────────
  {
    id: 'fall', title: '第二庭院', name: '坠落', en: 'THE FALL',
    poem: '向下坠落，便会从天而降。',
    palette: 'mint', size: [40, 40, 40],
    build(b) {
      b.platform(10, 12, 24, 26, 12, 3, M.STONE, 3);
      // 栈桥
      b.box(24, 11, 18, 31, 12, 20, M.PANEL);
      b.box(24, 12, 17, 30, 13, 18, M.TRIM);
      b.box(24, 12, 20, 30, 13, 21, M.TRIM);
      b.lamp(30, 12, 17); b.lamp(30, 12, 20);
      // 起点上的塔与拱门
      b.box(11, 12, 13, 14, 21, 16, M.PANEL);
      b.box(10, 21, 12, 15, 22, 17, M.TRIM);
      b.lamp(12, 22, 14);
      b.arch(16, 12, 13, true, 4, 5, M.TRIM);
      b.arch(16, 12, 24, true, 4, 5, M.TRIM);
      b.decoTree(19, 12, 21, 3, { hue: '#8fc48a', seed: 21 });
      // 高悬的浮岛
      b.platform(24, 14, 38, 24, 28, 3, M.STONE, 2);
      b.box(35, 28, 17, 36, 33, 18, M.TRIM);
      b.box(35, 28, 21, 36, 33, 22, M.TRIM);
      b.box(35, 33, 17, 36, 34, 22, M.TRIM);
      b.lamp(35, 33, 19); b.lamp(35, 33, 20);
      b.portal(35, 28, 18, 36, 33, 21, { axis: 0 });
      b.decoTree(28, 28, 16, 3, { hue: '#a7d07c', seed: 8, scale: 0.9 });
      b.decoTree(31, 28, 22, 3, { hue: '#86c2a0', seed: 9, scale: 0.7 });
      cornerIslands(b, 202);
      b.frame(4, 30, 30, 4, 4, 1, M.TRIM);
      b.spawnAt(13.5, 12, 19.5, -90);
    },
    hints: [
      { text: '世界在每个方向上首尾相连。', when: () => true, dur: 6 },
      { text: '浮岛高不可攀……走到栈桥尽头，纵身落下。', when: (G) => G.p.grav === 3 && G.p.pos[0] > 23 && G.p.pos[1] < 20 },
      { text: '向下坠落，便会从天而降。', when: (G) => G.p.pos[1] > 26 && G.p.grav === 3 && G.p.grounded, dur: 5 },
    ],
  },

  // ───────────────────────── 第三庭院 · 方块 ─────────────────────────
  {
    id: 'cubes', title: '第三庭院', name: '方块', en: 'CUBES',
    poem: '万物各有其重力。',
    palette: 'peach', size: [40, 40, 40],
    build(b) {
      b.platform(6, 6, 34, 34, 10, 3, M.STONE, 3);
      // 前后两厅的隔墙
      b.box(6, 10, 20, 34, 16, 21, M.PANEL);
      b.box(6, 16, 20, 34, 17, 21, M.TRIM);
      b.door('d1', 18, 10, 20, 22, 14, 21, { open: [0, -4, 0], requires: ['s1'] });
      // 北墙（青之重力的地面）
      b.box(6, 10, 32, 34, 22, 34, M.PANEL);
      b.box(6, 22, 32, 34, 23, 34, M.TRIM);
      for (const x of [8, 14, 18, 26]) b.lamp(x, 20, 32);
      // 光门小室（东侧）
      b.box(28, 10, 21, 29, 16, 32, M.PANEL);
      b.box(33, 10, 21, 34, 16, 32, M.PANEL);
      b.box(28, 16, 21, 34, 17, 32, M.TRIM);
      b.door('d2', 28, 10, 25, 29, 14, 28, { open: [0, -4, 0], requires: ['s1', 's2'] });
      b.box(31, 10, 24, 32, 15, 25, M.TRIM);
      b.box(31, 10, 28, 32, 15, 29, M.TRIM);
      b.box(31, 14, 24, 32, 15, 29, M.TRIM);
      b.portal(31, 10, 25, 32, 14, 28, { axis: 0 });
      // 机关
      b.cube(11, 10, 11, 3);
      b.socket('s1', 26, 10, 16, 3);
      b.cube(10, 15, 31, 4);
      b.socket('s2', 22, 13, 31, 4);
      // 装饰
      b.colonnade(6, 6, 34, 7, 10, 4, 4, M.TRIM);
      b.decoTree(8, 10, 17, 3, { hue: '#e59a74', seed: 31, scale: 0.8 });
      b.decoTree(9, 10, 27, 4, { seed: 32, scale: 0.75 });
      cornerIslands(b, 303);
      b.spawnAt(16.5, 10, 9.5, 180);
    },
    hints: [
      { text: '<b>鼠标左键</b> 或 <b>E</b> 拿起方块，对准插槽再按一次放入。', when: (G) => G.p.pos[2] < 20 && !G.flags.picked, dur: 8 },
      { text: '方块只听从与它同色的重力。', when: (G) => G.flags.denied, dur: 6 },
      { text: '青色方块属于北墙。站到墙上，它才会回应你。', when: (G) => G.p.pos[2] > 21 && G.p.grav === 3 && !G.flags.pickedColor[4], dur: 8 },
      { text: '手持方块时无法改变重力。', when: (G) => G.flags.deniedShift, dur: 5 },
      { text: '两盏灯都亮起时，门便会打开。', when: (G) => G.mech.isActive('s2') && !G.mech.isActive('d2'), dur: 6 },
    ],
  },

  // ───────────────────────── 第四庭院 · 回环 ─────────────────────────
  {
    id: 'loop', title: '第四庭院', name: '回环', en: 'LOOP',
    poem: '你够不着的地方，落下的东西够得着。',
    palette: 'dusk', size: [40, 40, 40],
    build(b) {
      b.platform(8, 8, 24, 24, 12, 3, M.STONE, 3);
      // 高悬的插槽石台
      b.box(24, 22, 14, 27, 25, 17, M.STONE);
      b.box(23, 24, 13, 24, 25, 14, M.TRIM); b.box(27, 24, 13, 28, 25, 14, M.TRIM);
      b.box(23, 24, 17, 24, 25, 18, M.TRIM); b.box(27, 24, 17, 28, 25, 18, M.TRIM);
      b.box(25, 20, 15, 26, 22, 16, M.DARK);
      b.lamp(25, 19, 15);
      b.socket('s1', 25, 25, 15, 3);
      // 光门神龛
      b.box(10, 12, 10, 16, 17, 11, M.PANEL);
      b.box(10, 12, 15, 16, 17, 16, M.PANEL);
      b.box(10, 12, 11, 11, 17, 15, M.PANEL);
      b.box(15, 12, 11, 16, 17, 12, M.PANEL);
      b.box(15, 12, 14, 16, 17, 15, M.PANEL);
      b.box(15, 15, 12, 16, 17, 14, M.PANEL);
      b.box(9, 17, 9, 17, 18, 17, M.TRIM);
      b.door('d1', 15, 12, 12, 16, 15, 14, { open: [0, 3, 0], requires: ['s1'] });
      b.portal(12, 12, 12, 13, 15, 14, { axis: 0 });
      b.lamp(11, 16, 13);
      b.cube(18, 12, 19, 3);
      // 装饰
      b.colonnade(8, 23, 24, 24, 12, 4, 3, M.TRIM);
      b.decoTree(20, 12, 10, 3, { hue: '#a98be0', seed: 41, scale: 0.8 });
      b.frame(32, 12, 32, 5, 2, 1, M.TRIM);
      cornerIslands(b, 404);
      b.spawnAt(11.5, 12, 20.5, -90);
    },
    hints: [
      { text: '插槽高悬在虚空之上，你够不着它。', when: (G) => G.p.pos[0] > 20 && !G.flags.picked, dur: 6 },
      { text: '但方块会坠落——也会从天而降。站在边缘，对准石台的正下方松手。', when: (G) => G.holding && G.p.pos[0] > 21, dur: 9 },
    ],
  },

  // ───────────────────────── 第五庭院 · 悬停 ─────────────────────────
  {
    id: 'suspend', title: '第五庭院', name: '悬停', en: 'SUSPENSION',
    poem: '不属于你的重力，会让万物静止。',
    palette: 'frost', size: [40, 40, 40],
    build(b) {
      b.platform(10, 8, 32, 32, 10, 3, M.STONE, 3);
      // 西侧高墙（紫之重力的地面）
      b.box(8, 7, 8, 10, 24, 32, M.PANEL);
      b.box(8, 24, 8, 10, 25, 32, M.TRIM);
      for (const z of [11, 17, 29]) b.lamp(9, 21, z);
      // 两米高的台地
      b.box(10, 10, 24, 32, 12, 32, M.STONE);
      b.box(10, 11, 24, 32, 12, 25, M.TRIM);
      // 光门神龛（台地东端）
      b.box(26, 12, 24, 27, 18, 27, M.PANEL);
      b.box(26, 12, 30, 27, 18, 32, M.PANEL);
      b.box(26, 15, 27, 27, 18, 30, M.PANEL);
      b.box(27, 12, 24, 32, 18, 25, M.PANEL);
      b.box(27, 12, 31, 32, 18, 32, M.PANEL);
      b.box(31, 12, 25, 32, 18, 31, M.PANEL);
      b.box(26, 18, 24, 32, 19, 32, M.TRIM);
      b.door('d1', 26, 12, 27, 27, 15, 30, { open: [0, 3, 0], requires: ['sp', 'sr'] });
      b.portal(29, 12, 27, 30, 15, 30, { axis: 0 });
      b.lamp(30, 17, 28);
      // 机关
      b.socket('sp', 10, 10, 23, 1);
      b.cube(10, 17, 14, 1);
      b.cube(20, 10, 13, 3);
      b.socket('sr', 21, 12, 28, 3);
      // 装饰
      b.decoTree(30, 10, 12, 3, { hue: '#9ab8e0', seed: 51 });
      b.decoTree(16, 12, 29, 3, { hue: '#b0c7a4', seed: 52, scale: 0.7 });
      cornerIslands(b, 505);
      b.spawnAt(18.5, 10, 11.5, 180);
    },
    hints: [
      { text: '台地太高。抱着方块，你无法改变重力，也跳不上去。', when: (G) => G.holding && G.p.pos[2] > 20 && G.p.grav === 3, dur: 7 },
      { text: '其他颜色的方块会冻结在半空，像石头一样坚固。', when: (G) => G.p.pos[2] > 18 && !G.flags.pickedColor[1], dur: 7 },
      { text: '紫色方块属于西墙。把它放进墙角的插槽，它就成了一级台阶。', when: (G) => G.p.grav === 1, dur: 8 },
    ],
  },

  // ───────────────────────── 第六庭院 · 水 ─────────────────────────
  {
    id: 'water', title: '第六庭院', name: '水', en: 'WATER',
    poem: '水只向低处流，而低处无处不在。',
    palette: 'spring', size: [40, 40, 40],
    build(b) {
      b.platform(6, 6, 34, 34, 11, 3, M.STONE, 3);
      // 背墙与出水口
      b.box(6, 11, 32, 34, 20, 34, M.PANEL);
      b.box(6, 20, 32, 34, 21, 34, M.TRIM);
      b.box(19, 15, 30, 22, 18, 32, M.TRIM);
      b.lamp(20, 17, 30);
      b.water(20, 14, 31, 3);
      // 水渠（嵌入地面一格深）
      b.clear(20, 10, 25, 21, 11, 32);
      b.paint(19, 9, 24, 22, 10, 32, M.CHANNEL);
      b.paint(19, 10, 25, 20, 11, 32, M.CHANNEL);
      b.paint(21, 10, 25, 22, 11, 30, M.CHANNEL);
      // 无底井：贯穿整座平台
      b.clear(20, 0, 24, 21, 11, 25);
      b.box(19, 11, 23, 22, 12, 24, M.TRIM);
      b.box(19, 11, 25, 20, 12, 26, M.TRIM);
      b.box(21, 11, 25, 22, 12, 26, M.TRIM);
      // 支渠通往树
      b.clear(21, 10, 30, 26, 11, 31);
      b.paint(21, 9, 29, 26, 11, 32, M.CHANNEL);
      b.box(26, 10, 29, 29, 11, 32, M.SOIL);
      b.tree('t1', 26, 11, 30, 3, { fruits: 2, seed: 61 });
      // 光门神龛（南侧）
      b.box(16, 11, 6, 24, 17, 7, M.PANEL);
      b.box(16, 11, 7, 17, 17, 12, M.PANEL);
      b.box(23, 11, 7, 24, 17, 12, M.PANEL);
      b.box(16, 11, 11, 19, 17, 12, M.PANEL);
      b.box(21, 11, 11, 24, 17, 12, M.PANEL);
      b.box(19, 14, 11, 21, 17, 12, M.PANEL);
      b.box(15, 17, 6, 25, 18, 13, M.TRIM);
      b.door('d1', 19, 11, 11, 21, 14, 12, { open: [0, 3, 0], requires: ['s1', 's2'] });
      b.portal(18, 11, 8, 22, 15, 9, { axis: 4 });
      b.lamp(16, 15, 9); b.lamp(23, 15, 9);
      b.socket('s1', 17, 11, 15, 3);
      b.socket('s2', 22, 11, 15, 3);
      b.cube(11, 11, 27, 3);
      // 装饰
      b.colonnade(6, 6, 7, 30, 11, 4, 4, M.TRIM);
      b.decoTree(9, 11, 9, 3, { hue: '#7fc29a', seed: 62, scale: 0.8 });
      b.decoTree(31, 11, 10, 3, { hue: '#a3cf83', seed: 63, scale: 0.9 });
      cornerIslands(b, 606);
      b.spawnAt(12.5, 11, 18.5, 180);
    },
    hints: [
      { text: '水从高处来，坠入无底之井，又从天上落回井中。', when: () => true, dur: 7 },
      { text: '树需要水。用方块挡住水渠，让水改道。', when: (G) => G.p.pos[2] > 22 && G.trees.list[0].state === 'sapling', dur: 8 },
      { text: '树结出了果实——它们也是方块。', when: (G) => G.trees.list[0] && G.trees.list[0].state === 'grown', dur: 6 },
    ],
  },

  // ───────────────────────── 第七庭院 · 倒悬 ─────────────────────────
  {
    id: 'inverted', title: '第七庭院', name: '倒悬', en: 'INVERTED',
    poem: '天空在脚下，大地在头顶。',
    palette: 'amber', size: [40, 40, 40],
    build(b) {
      // 主平台：底面平整（金之重力的地面）
      b.box(8, 9, 8, 32, 12, 28, M.STONE);
      b.box(8, 8, 8, 32, 9, 9, M.TRIM); b.box(8, 8, 27, 32, 9, 28, M.TRIM);
      // 顶棚与柱
      b.box(8, 18, 8, 20, 20, 28, M.PANEL);
      b.box(8, 20, 8, 20, 21, 28, M.TRIM);
      for (const [x, z] of [[8, 8], [8, 27], [19, 8], [19, 27], [8, 17], [19, 17]]) b.box(x, 12, z, x + 1, 18, z + 1, M.TRIM);
      for (const [x, z] of [[11, 12], [16, 12], [11, 23], [16, 23]]) b.lamp(x, 18, z);
      // 金色方块挂在顶棚下
      b.cube(12, 17, 13, 2);
      // 金色插槽位于主平台底面，紧挨顶棚边缘的投影
      b.socket('sg', 21, 8, 20, 2);
      for (const [x, z] of [[19, 18], [23, 18], [19, 22], [23, 22]]) b.box(x, 8, z, x + 1, 9, z + 1, M.TRIM);
      b.lamp(19, 18, 20);
      // 倒挂在平台底面的光门神龛（在金之重力下才是“正”的）
      b.box(25, 3, 12, 31, 9, 13, M.PANEL);
      b.box(25, 3, 19, 31, 9, 20, M.PANEL);
      b.box(30, 3, 13, 31, 9, 19, M.PANEL);
      b.box(25, 3, 13, 26, 9, 15, M.PANEL);
      b.box(25, 3, 17, 26, 9, 19, M.PANEL);
      b.box(25, 3, 15, 26, 6, 17, M.PANEL);
      b.box(24, 2, 11, 32, 3, 21, M.TRIM);
      b.door('d1', 25, 6, 15, 26, 9, 17, { open: [0, -3, 0], requires: ['sg'] });
      b.portal(28, 6, 15, 29, 9, 17, { axis: 0, up: 3 });
      b.lamp(30, 4, 16);
      // 装饰
      b.decoTree(25, 12, 24, 3, { hue: '#e0b060', seed: 71 });
      b.decoTree(14, 20, 20, 3, { hue: '#c9cf7a', seed: 72, scale: 0.8 });
      b.decoTree(14, 17, 21, 2, { hue: '#e3a14a', seed: 73, scale: 0.7 });
      cornerIslands(b, 707);
      b.spawnAt(14.5, 12, 24.5, 0);
    },
    hints: [
      { text: '金色方块属于顶棚。抬头看。', when: (G) => G.p.grav === 3 && !G.flags.pickedColor[2], dur: 6 },
      { text: '插槽在平台的底面。向“下”坠落的东西，终会从下方升起。', when: (G) => G.p.grav === 2, dur: 8 },
    ],
  },

  // ───────────────────────── 第八庭院 · 庭院之心 ─────────────────────────
  {
    id: 'heart', title: '第八庭院', name: '庭院之心', en: 'THE HEART',
    poem: '三种重力，三盏灯火。',
    palette: 'heart', size: [48, 48, 48],
    build(b) {
      // 主广场
      b.platform(6, 6, 32, 40, 12, 3, M.STONE, 3);
      b.colonnade(6, 6, 32, 7, 12, 4, 4, M.TRIM);
      // ── 赤：广场上的泉与井；水改道后从边缘坠落，绕回浮岛顶部 ──
      b.box(28, 12, 19, 29, 17, 20, M.TRIM);
      b.box(28, 15, 18, 29, 17, 19, M.TRIM);
      b.lamp(28, 16, 18);
      b.water(28, 14, 18, 3);
      b.clear(26, 11, 18, 32, 12, 19);
      b.paint(25, 10, 17, 32, 12, 20, M.CHANNEL);
      b.clear(26, 0, 18, 27, 11, 19);
      b.cube(22, 12, 14, 3);
      // 浮岛（平底，顶面刻水渠，种一棵赤之树）
      b.box(28, 31, 14, 38, 34, 22, M.STONE);
      b.box(28, 34, 14, 38, 35, 15, M.TRIM); b.box(28, 34, 21, 38, 35, 22, M.TRIM);
      b.clear(32, 33, 18, 34, 34, 19);
      b.paint(31, 32, 17, 35, 34, 20, M.CHANNEL);
      b.box(34, 33, 16, 37, 34, 21, M.SOIL);
      b.tree('tr', 34, 34, 18, 3, { fruits: 2, seed: 81, scale: 0.85 });
      b.lamp(28, 32, 14); b.lamp(37, 32, 21);
      // ── 金：顶棚下的金色方块；插槽在浮岛底面 ──
      b.box(24, 19, 22, 32, 24, 30, M.PANEL);
      b.box(24, 24, 22, 32, 25, 30, M.TRIM);
      for (const [x, z] of [[24, 22], [31, 22], [24, 29], [31, 29]]) b.box(x, 12, z, x + 1, 19, z + 1, M.TRIM);
      b.lamp(26, 19, 24); b.lamp(29, 19, 27);
      b.cube(27, 18, 26, 2);
      b.socket('sg', 30, 30, 19, 2);
      for (const [x, z] of [[29, 17], [31, 17], [29, 21], [31, 21]]) b.box(x, 30, z, x + 1, 31, z + 1, M.TRIM);
      // ── 青：南塔喷出的横向水流，穿过庭院打在北墙上 ──
      b.box(16, 12, 6, 23, 31, 8, M.PANEL);
      b.box(15, 31, 5, 24, 32, 9, M.TRIM);
      b.box(18, 24, 8, 21, 27, 10, M.TRIM);
      b.lamp(19, 28, 7);
      b.water(19, 25, 10, 4);
      b.box(6, 9, 40, 32, 31, 42, M.PANEL);
      b.box(6, 31, 40, 32, 32, 42, M.TRIM);
      b.clear(15, 25, 40, 24, 26, 41);
      b.paint(14, 24, 41, 25, 27, 42, M.CHANNEL);
      b.clear(14, 25, 40, 15, 26, 42);
      b.box(24, 25, 40, 25, 26, 41, M.SOIL);
      b.tree('tc', 24, 25, 39, 4, { fruits: 2, seed: 82 });
      b.cube(10, 18, 39, 4);
      b.socket('sc', 27, 19, 39, 4);
      for (const [x, y] of [[8, 28], [30, 14], [11, 14], [29, 28]]) b.lamp(x, y, 40);
      // ── 心之圣所 ──
      b.box(7, 12, 22, 15, 21, 23, M.PANEL);
      b.box(7, 12, 29, 15, 21, 30, M.PANEL);
      b.box(7, 12, 23, 8, 21, 29, M.PANEL);
      b.box(14, 12, 23, 15, 21, 25, M.PANEL);
      b.box(14, 12, 27, 15, 21, 29, M.PANEL);
      b.box(14, 15, 25, 15, 21, 27, M.PANEL);
      b.box(6, 21, 21, 16, 22, 31, M.TRIM);
      b.door('d1', 14, 12, 25, 15, 15, 27, { open: [0, 3, 0], requires: ['sr', 'sc', 'sg'] });
      b.box(9, 14, 25, 11, 16, 27, M.GLOW);
      b.portal(11, 12, 24, 12, 17, 28, { axis: 0 });
      b.lamp(7, 19, 26); b.lamp(10, 20, 22); b.lamp(10, 20, 29);
      b.socket('sr', 17, 12, 24, 3);
      // 装饰
      b.decoTree(10, 12, 35, 3, { hue: '#d98aa0', seed: 83, scale: 1.1 });
      b.decoTree(20, 12, 37, 3, { hue: '#e6b07a', seed: 84, scale: 0.8 });
      b.frame(40, 24, 40, 6, 4, 1, M.TRIM);
      b.frame(2, 40, 24, 5, 2, 1, M.TRIM);
      b.scatter(808, 8, [40, 2, 0, 47, 46, 8], 2, M.TRIM);
      b.scatter(809, 6, [0, 2, 42, 5, 46, 47], 2, M.PANEL);
      b.spawnAt(18.5, 12, 33.5, 0);
    },
    hints: [
      { text: '庭院之心沉睡着。三盏灯——赤、青、金——都亮起时，它才会醒来。', when: () => true, dur: 9 },
      { text: '井吞下了泉水。若水从广场边缘坠落，它会落在哪里？', when: (G) => G.game.time > 40 && G.trees.list.find((t) => t.def.id === 'tr').state === 'sapling', dur: 9 },
      { text: '浮岛的底面，在金之重力下也是一片土地。', when: (G) => G.flags.pickedColor[2], dur: 8 },
    ],
  },
];

export const TITLE_LEVEL = {
  id: 'title', palette: 'title', size: [48, 48, 48],
  build(b) {
    // 中央神殿：多层台地
    b.platform(14, 14, 34, 34, 18, 4, M.STONE, 4);
    b.box(17, 18, 17, 31, 20, 31, M.PANEL);
    b.box(20, 20, 20, 28, 23, 28, M.STONE);
    b.stairs(22, 18, 31, 5, 2, 4, 0, 4, M.PANEL);
    b.stairs(22, 18, 16, 4, 2, 4, 0, 4, M.PANEL);
    for (let i = 0; i < 4; i++) {
      const x = 15 + i * 6;
      b.box(x, 18, 14, x + 1, 26, 15, M.TRIM);
      b.box(x, 18, 33, x + 1, 26, 34, M.TRIM);
    }
    b.box(14, 26, 14, 34, 27, 15, M.TRIM);
    b.box(14, 26, 33, 34, 27, 34, M.TRIM);
    b.lamp(24, 23, 24);
    b.decoTree(24, 23, 23, 3, { hue: '#e69a76', seed: 3, scale: 1.3 });
    b.decoTree(18, 20, 18, 3, { hue: '#9fc17a', seed: 4 });
    b.decoTree(29, 20, 29, 3, { hue: '#86c2a0', seed: 6 });
    // 背后的瀑布墙：水坠入虚空，又从天而降
    b.box(22, 18, 34, 27, 30, 36, M.PANEL);
    b.box(23, 27, 33, 26, 29, 34, M.TRIM);
    b.water(24, 26, 33, 3);
    // 贯穿天地的无尽立柱与横梁
    for (const [x, z] of [[3, 3], [43, 3], [3, 43], [43, 43]]) {
      b.box(x, 0, z, x + 3, 48, z + 3, M.PANEL);
      for (let y = 4; y < 48; y += 12) b.lamp(x + 1, y, z);
    }
    b.box(0, 8, 44, 48, 10, 46, M.TRIM);
    b.box(44, 36, 0, 46, 38, 48, M.TRIM);
    b.box(0, 30, 2, 48, 31, 3, M.STONE);
    // 墙上的侧生之树（暗示其他方向的重力）
    b.decoTree(46, 22, 4, 1, { hue: '#a98be0', seed: 7, scale: 0.8 });
    b.decoTree(2, 14, 44, 0, { hue: '#7dc06f', seed: 8, scale: 0.8 });
    b.frame(24, 42, 24, 8, 2, 1, M.TRIM);
    b.frame(24, 8, 4, 5, 4, 1, M.TRIM);
    b.spawnAt(24, 18, 24);
  },
  hints: [],
};

export { inBox };
