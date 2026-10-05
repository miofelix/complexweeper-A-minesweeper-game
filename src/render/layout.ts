// 布局计算：与桌面版 main.zig 的 layout()/countersWidth()/faceLeft() 等逐条对应。
// 纯函数，不依赖 DOM，可单测。

export interface Layout {
  z: number;
  frame: number;
  pad: number;
  header_h: number;
  gap: number;
  box: number;
  inner_w: number;
  client_w: number;
  client_h: number;
  board_x: number;
  board_y: number;
  cell: number;
  header_x: number;
  header_y: number;
  header_w: number;
}

/** 实雷与计时器四格，虚雷三格（第四格留给 i 单位） */
export const REAL_DIGITS = 4;
export const IMAG_DIGITS = 3;

export function pow10i(n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= 10;
  return r;
}

/** 数值区固定几格：负数要占掉一格画负号，超出范围才再加一格。null 按 base 画空格子 */
export function valueDigits(base: number, v: number | null): number {
  if (v === null) return base;
  if (v >= 0) return v <= pow10i(base) - 1 ? base : base + 1;
  return v >= -(pow10i(base - 1) - 1) ? base : base + 1;
}

/** 数值区占几格（实雷/计时器四格、虚雷三格） */
export function panelValueDigits(imag: boolean, v: number | null): number {
  return valueDigits(imag ? IMAG_DIGITS : REAL_DIGITS, v);
}

/** 一块面板占几格：数值区 + 虚雷那一格 i 单位 */
export function panelCells(imag: boolean, v: number | null): number {
  return panelValueDigits(imag, v) + (imag ? 1 : 0);
}

/** 一个计雷器的宽度：图标 + 留白 + N 格 LED + 边框 */
export function counterWidth(z: number, digits: number): number {
  return 16 * z + 2 * z + digits * 13 * z + 2 * z;
}

/** 计时器面板宽度：四格 LED + 边框（没有图标那一块） */
export function timerWidth(z: number): number {
  return 4 * 13 * z + 2 * z;
}

export const FACE_SIZE = 24;
/** 贴图里的脸偏右下半个像素，整体往左上挪这么多屏幕像素 */
export const FACE_NUDGE = 2;

/** 表头最小宽度：左侧一列计雷器 + 人脸 + 计时 + 留白（计雷器按常态四格算） */
export function headerContentWidth(z: number): number {
  const col = counterWidth(z, 4);
  return 4 * z + col + 8 * z + FACE_SIZE * z + 8 * z + timerWidth(z) + 4 * z;
}

export interface BoardLike {
  w: number;
  h: number;
}

export function makeLayout(z: number, board: BoardLike): Layout {
  const frame = 3 * z;
  const pad = 6 * z;
  const gap = 6 * z;
  const box = 3 * z;
  const cell = 16 * z;
  const board_w = board.w * cell + 2 * box;
  const hw = headerContentWidth(z);
  const inner_w = Math.max(board_w, hw);
  const client_w = inner_w + 2 * (frame + pad);
  // 表头里四个计雷器竖着排：上下边框 2z×2 + 内边距 3z×2 + 四行 26z + 三个行距 2z
  const counters_h = 4 * (26 * z) + 3 * (2 * z);
  const header_h = 2 * (2 * z) + 2 * (3 * z) + counters_h;
  const client_h = 2 * (frame + pad) + header_h + gap + board.h * cell + 2 * box;
  return {
    z,
    frame,
    pad,
    header_h,
    gap,
    box,
    inner_w,
    client_w,
    client_h,
    board_x: frame + pad + Math.floor((inner_w - board_w) / 2) + box,
    board_y: frame + pad + header_h + gap + box,
    cell,
    header_x: frame + pad,
    header_y: frame + pad,
    header_w: inner_w,
  };
}

/** 计雷器竖排那一列的整体宽度（绘制与人脸定位共用） */
export function countersWidth(
  L: Layout,
  counterShown: (t: number) => number | null,
): number {
  let widest = 0;
  for (let t = 1; t < 5; t++) {
    const imag = t === 3 || t === 4;
    widest = Math.max(widest, counterWidth(L.z, panelCells(imag, counterShown(t))));
  }
  return widest;
}

export function countersX(L: Layout): number {
  return L.header_x + 4 * L.z;
}
export function countersY(L: Layout): number {
  return L.header_y + 2 * L.z + 3 * L.z;
}

export function timerX(L: Layout): number {
  return L.header_x + L.header_w - 4 * L.z - timerWidth(L.z);
}
export function timerY(L: Layout): number {
  return L.header_y + Math.floor((L.header_h - 26 * L.z) / 2);
}

/** 人脸按钮左上角：先在表头正中摆，再整体往左上挪 FACE_NUDGE */
export function faceLeft(L: Layout, counterShown: (t: number) => number | null): number {
  const size = FACE_SIZE * L.z;
  const counters_end = countersX(L) + countersWidth(L, counterShown);
  const timer_start = timerX(L);
  const clearance = 6 * L.z;
  let fx = L.header_x + Math.floor(L.header_w / 2) - Math.floor(size / 2);
  if (fx < counters_end + clearance) fx = counters_end + clearance;
  if (fx + size > timer_start - clearance) fx = timer_start - clearance - size;
  if (fx < L.header_x) fx = L.header_x;
  return fx - FACE_NUDGE;
}

export function faceTop(L: Layout): number {
  return L.header_y + Math.floor((L.header_h - FACE_SIZE * L.z) / 2) - FACE_NUDGE;
}

/** 像素坐标 → 格子下标；不在棋盘内返回 -1 */
export function cellAt(L: Layout, board: BoardLike, px: number, py: number): number {
  const cx = px - L.board_x;
  const cy = py - L.board_y;
  if (cx < 0 || cy < 0) return -1;
  const c = Math.floor(cx / L.cell);
  const r = Math.floor(cy / L.cell);
  if (c < 0 || r < 0 || c >= board.w || r >= board.h) return -1;
  return r * board.w + c;
}

/** 像素坐标是否在人脸按钮上 */
export function inFace(
  L: Layout,
  px: number,
  py: number,
  counterShown: (t: number) => number | null,
): boolean {
  const fw = FACE_SIZE * L.z;
  const fx = faceLeft(L, counterShown);
  const fy = faceTop(L);
  return px >= fx && py >= fy && px < fx + fw && py < fy + fw;
}
