export const MAX_W = 40;
export const MAX_H = 30;
export const MAX_CELLS = MAX_W * MAX_H;
export const MAX_MINES = 999;

/** 圆复数模式 i² = −1；闵可夫斯基模式（双曲复数）j² = +1。 */
export type GameMode = 'complex' | 'hyper';

/** 四种雷：(a, b) 分别是实部与单位雷（i / j）的贡献；闵可夫斯基模式中分别称类空部与类时部。 */
export const TYPES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 只可能出现的 24 个显示值 D = |S|^2 */
export const ACHIEVABLE: readonly number[] = [
  0, 1, 2, 4, 5, 8, 9, 10, 13, 16, 17, 18, 20, 25, 26, 29, 32, 34, 36, 37, 40, 49, 50, 64,
];

/** 闵可夫斯基模式的 39 个显示值 D = a² − b²，可为负。 */
export const HYPER_ACHIEVABLE: readonly number[] = [
  -64, -49, -48, -36, -35, -32, -25, -24, -21, -16, -15, -12, -9, -8, -7, -5, -4, -3, -1,
  0, 1, 3, 4, 5, 7, 8, 9, 12, 15, 16, 21, 24, 25, 32, 35, 36, 48, 49, 64,
];

export interface Preset {
  w: number;
  h: number;
  mines: number;
  label: string;
}

/** 标准三档（类型随机撒） */
export const PRESETS: readonly Preset[] = [
  { w: 9, h: 9, mines: 10, label: '初级 9×9 · 10 雷' },
  { w: 16, h: 16, mines: 40, label: '中级 16×16 · 40 雷' },
  { w: 30, h: 16, mines: 99, label: '高级 30×16 · 99 雷' },
];

/** 状态行文字（逻辑层只给枚举，文案在界面层） */
export const enum Msg {
  none = 0,
  started,
  judge_fail,
  expand_ok,
  win,
  lose,
}
