// Canvas 2D 绘制：与桌面版 main.zig 的 paint() 逐条对应，经典灰底立体边框风格。

import type { Game } from '../game/game';
import { Atlas, type Slot } from './atlas';
import {
  FACE_SIZE,
  type Layout,
  counterWidth,
  countersX,
  countersY,
  faceLeft,
  faceTop,
  panelCells,
  panelValueDigits,
  pow10i,
  timerWidth,
  timerX,
  timerY,
} from './layout';

const C_BTNFACE = '#C0C0C0';
const C_HILIGHT = '#DFDFDF';
const C_SHADOW = '#808080';

/** 界面层给绘制提供的交互态（对应 main.zig 的全局量） */
export interface PaintState {
  /** 按住不放的那一格（按下预览），-1 = 没有 */
  pressCell: number;
  /** 左右键同按/中键按住准备展开的那一格，-1 = 没有 */
  chordCell: number;
  /** 人脸按钮是否被按住 */
  faceDown: boolean;
  /** 棋盘上是否有键按着（左键不在脸上、右键、中键） */
  boardHeld: boolean;
  /** 「脸扫雷」闪动截止时间戳（ms，performance.now 系） */
  faceFlashUntil: number;
  /** 当前时间戳（ms） */
  now: number;
  /** 计时器显示的秒数 */
  timerSeconds: number;
}

export function counterValue(game: Game, t: number): number {
  const k = game.unmarked(t);
  return t === 2 || t === 4 ? -k : k;
}

/** 还没开局时计雷器画空格子 */
export function counterShown(game: Game, t: number): number | null {
  if (!game.started) return null;
  return counterValue(game, t);
}

export function counterImag(t: number): boolean {
  return t === 3 || t === 4;
}

/** 这一格能不能作为展开起点（门槛与 Game.tryExpand 一致） */
export function chordable(game: Game, c: number): boolean {
  if (c < 0 || c >= game.n) return false;
  if (game.over || game.open[c] === 0 || game.mine[c] !== 0) return false;
  const buf: number[] = [];
  const k = game.nbrs(c, buf as any);
  for (let x = 0; x < k; x++) {
    const j = buf[x];
    if (game.open[j] === 0 && game.flag[j] === 0) return true;
  }
  return false;
}

/** 这一格是不是"按住期间即将被展开"的 */
export function chordTarget(game: Game, st: PaintState, i: number): boolean {
  if (st.chordCell < 0) return false;
  const c = st.chordCell;
  if (!chordable(game, c)) return false;
  if (game.open[i] !== 0 || game.flag[i] !== 0) return false;
  const buf: number[] = [];
  const k = game.nbrs(c, buf as any);
  for (let x = 0; x < k; x++) {
    if (buf[x] === i) return true;
  }
  return false;
}

/** 给定游戏与交互状态，返回该格应绘制的槽位名（供单测断言） */
export function cellSpriteName(game: Game, st: PaintState, i: number): string {
  // 按住不放的那一格：画成已翻开的空白（按下预览），松手才真翻开
  if (st.pressCell >= 0 && st.pressCell === i && game.open[i] === 0) return 'blank';
  // 展开预览
  if (chordTarget(game, st, i)) return 'blank';
  const revealed = game.over && !game.win;
  if (game.open[i] !== 0) {
    if (game.mine[i] !== 0) {
      if (game.boom === i) return `boom_${game.mine[i]}`;
      return `mine_${game.mine[i]}`;
    }
    const D = game.clue[i];
    if (D === 0 && game.nbrMineCount(i) === 0) return 'blank';
    return `num_${D}`;
  }
  if (game.flag[i] !== 0) {
    const right = game.mine[i] === game.flag[i];
    if (revealed && !right) return `wrong_${game.flag[i]}`;
    return `flag_${game.flag[i]}`;
  }
  if (revealed && game.mine[i] !== 0) return `mine_${game.mine[i]}`;
  return 'closed';
}

/** 当前人脸贴图 */
export function faceSpriteName(game: Game, st: PaintState): string {
  if (st.faceDown) return 'face_down';
  if (game.over) return game.win ? 'face_win' : 'face_dead';
  if (st.boardHeld) return 'face_scan';
  if (st.now < st.faceFlashUntil) return 'face_scan';
  return 'face_normal';
}

export class Renderer {
  private atlas: Atlas;

  constructor(atlas: Atlas) {
    this.atlas = atlas;
  }

  private fill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  /** 经典立体边框：raised = 左上亮、右下暗；sunken 反过来 */
  private draw3d(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, raised: boolean): void {
    const a = raised ? C_HILIGHT : C_SHADOW;
    const b = raised ? C_SHADOW : C_HILIGHT;
    this.fill(ctx, x, y, w, t, a); // 上
    this.fill(ctx, x, y, t, h, a); // 左
    this.fill(ctx, x, y + h - t, w, t, b); // 下
    this.fill(ctx, x + w - t, y, t, h, b); // 右
  }

  private blit(ctx: CanvasRenderingContext2D, s: Slot, dx: number, dy: number, dw: number, dh: number): void {
    ctx.drawImage(this.atlas.image, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
  }

  private blitSq(ctx: CanvasRenderingContext2D, s: Slot, x: number, y: number, size: number): void {
    this.blit(ctx, s, x, y, size, size);
  }

  /** 画一段 LED 数字。null = 空格子。返回画过的宽度。与 drawLed 一致。 */
  drawLed(ctx: CanvasRenderingContext2D, x: number, y: number, v: number | null, digits: number, z: number): number {
    const lw = 13 * z;
    const lh = 23 * z;
    let cx = x;
    if (v === null) {
      for (let i = 0; i < digits; i++) {
        this.blit(ctx, this.atlas.slot('led_blank'), cx, y, lw, lh);
        cx += lw;
      }
      return cx - x;
    }
    if (v < 0) {
      this.blit(ctx, this.atlas.slot('led_minus'), cx, y, lw, lh);
      cx += lw;
      let m = Math.min(-v, pow10i(digits - 1) - 1);
      const s = String(m).padStart(digits - 1, '0');
      for (const ch of s) {
        this.blit(ctx, this.atlas.slot(`led_${ch}`), cx, y, lw, lh);
        cx += lw;
      }
    } else {
      let m = Math.min(v, pow10i(digits) - 1);
      const s = String(m).padStart(digits, '0');
      for (const ch of s) {
        this.blit(ctx, this.atlas.slot(`led_${ch}`), cx, y, lw, lh);
        cx += lw;
      }
    }
    return cx - x;
  }

  paint(ctx: CanvasRenderingContext2D, game: Game, L: Layout, st: PaintState): void {
    // 背景
    this.fill(ctx, 0, 0, L.client_w, L.client_h, C_BTNFACE);
    // 外框（凸起）
    this.draw3d(ctx, 0, 0, L.client_w, L.client_h, L.frame, true);

    // 表头面板（凹陷）
    this.draw3d(ctx, L.header_x, L.header_y, L.header_w, L.header_h, 2 * L.z, false);

    // 四个计雷器：竖排一列
    const col_x = countersX(L);
    let cy = countersY(L);
    for (let t = 1; t < 5; t++) {
      const val = counterShown(game, t);
      const imag = counterImag(t);
      const cw = counterWidth(L.z, panelCells(imag, val));
      this.draw3d(ctx, col_x, cy, cw, 26 * L.z, 1 * L.z, false);
      this.blitSq(ctx, this.atlas.flagSprite(t), col_x + L.z + L.z, cy + Math.floor((26 * L.z - 16 * L.z) / 2), 16 * L.z);
      const led_x = col_x + L.z + 2 * L.z + 16 * L.z;
      const led_y = cy + Math.floor((26 * L.z - 23 * L.z) / 2);
      const vw = this.drawLed(ctx, led_x, led_y, val, panelValueDigits(imag, val), L.z);
      // 虚雷还有第四格 i 单位（没开局时那一格也画成空格子）
      if (imag) this.blit(ctx, this.atlas.slot(val === null ? 'led_blank' : 'led_i'), led_x + vw, led_y, 13 * L.z, 23 * L.z);
      cy += 26 * L.z + 2 * L.z;
    }

    // 计时（右对齐，垂直居中；同样是四格数字）
    const tx = timerX(L);
    const ty = timerY(L);
    const tv = game.started ? st.timerSeconds : null;
    this.draw3d(ctx, tx, ty, timerWidth(L.z), 26 * L.z, 1 * L.z, false);
    this.drawLed(ctx, tx + L.z, ty + Math.floor((26 * L.z - 23 * L.z) / 2), tv, panelValueDigits(false, tv), L.z);

    // 人脸：贴图自带立体边，直接贴
    const shown = (t: number): number | null => counterShown(game, t);
    this.blitSq(
      ctx,
      this.atlas.slot(faceSpriteName(game, st)),
      faceLeft(L, shown),
      faceTop(L),
      FACE_SIZE * L.z,
    );

    // 棋盘凹槽
    const bx = L.board_x - L.box;
    const by = L.board_y - L.box;
    const bw = game.w * L.cell + 2 * L.box;
    const bh = game.h * L.cell + 2 * L.box;
    this.draw3d(ctx, bx, by, bw, bh, L.box, false);

    // 格子
    for (let i = 0; i < game.n; i++) {
      const r = Math.floor(i / game.w);
      const c = i % game.w;
      const x = L.board_x + c * L.cell;
      const y = L.board_y + r * L.cell;
      this.blitSq(ctx, this.atlas.slot(cellSpriteName(game, st, i)), x, y, L.cell);
    }
    // 没有状态行（判据不通过时不作任何提示）
  }
}
