// 游戏常量
export const PHYS_DT = 1 / 120;
export const GRAVITY = 22;
export const TERMINAL = 38;
export const JUMP_V = 7.6;
export const WALK = 4.6;
export const RUN = 7.2;
export const GROUND_ACC = 55;
export const AIR_ACC = 14;
export const HALF_UP = 0.85;
export const HALF_SIDE = 0.3;
export const EYE = 0.62;
export const STEP = 0.6;
export const REACH_SHIFT = 6.5;
export const REACH_GRAB = 2.9;
export const REACH_SOCKET = 4.0;
export const HOLD_DIST = 1.75;
export const CUBE_H = 0.42;
export const SHIFT_TIME = 0.62;

// 六种重力的颜色（编号同方向：0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z），表示“朝该方向坠落”
export const GRAV_HEX = ['#62b85a', '#9a6bdc', '#e8b23c', '#e45c4c', '#33b6c6', '#4c72e0'];
export const GRAV_NAME = ['翠', '紫', '金', '赤', '青', '蓝'];
export const GRAV_DESC = ['翠之重力', '紫之重力', '金之重力', '赤之重力', '青之重力', '蓝之重力'];
