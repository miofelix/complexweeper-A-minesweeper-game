// 输入层：鼠标 + 触屏（Pointer Events）统一为语义动作，不直接碰游戏状态。
// 手势语义与桌面版 main.zig 的消息处理一致：
//   左键按下=压住预览，松手落格才翻开；右键=循环插旗；左右同按/中键=展开预览，松手展开；
//   点脸重开；触屏：点按=翻开，长按=插旗，双击已开格=展开。

import { Game } from '../game/game';
import { Msg } from '../game/constants';
import { cellAt, inFace, type Layout } from '../render/layout';

export interface InputHooks {
  game: Game;
  getLayout: () => Layout;
  /** 任何可能改变画面的动作后调用（重绘 + 计时/脸闪等收尾） */
  onAction: (opts: { flashFace: boolean; startTimer: boolean; faceRestart?: boolean }) => void;
  /** 局面结束（胜负）时调用（纪录结算） */
  onGameOver: () => void;
  requestRender: () => void;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8; // px，长按期间允许的位移
const DOUBLE_TAP_MS = 350;

function counterShownFor(g: Game): (t: number) => number | null {
  return (t) => (g.started ? (t === 2 || t === 4 ? -g.unmarked(t) : g.unmarked(t)) : null);
}

export class InputController {
  private h: InputHooks;
  private press_cell = -1;
  private chord_cell = -1;
  private l_down = false;
  private r_down = false;
  private m_down = false;
  private face_down = false;
  private face_armed = false;
  private touch_flag_mode = false;

  // 触屏手势跟踪
  private touch_id: number | null = null;
  private touch_start_x = 0;
  private touch_start_y = 0;
  private touch_long_fired = false;
  private touch_long_timer: number | null = null;
  private touch_moved = false;
  private last_tap_t = 0;
  private last_tap_cell = -1;

  constructor(h: InputHooks) {
    this.h = h;
  }

  // ---------------------------------------------------------------- 状态查询（渲染用）
  get pressCell(): number {
    return this.press_cell;
  }
  get chordCell(): number {
    return this.chord_cell;
  }
  get faceDown(): boolean {
    return this.face_down;
  }
  get flagMode(): boolean {
    return this.touch_flag_mode;
  }
  /** 是否有活跃的触屏指针（用于识别触屏点按伴随的兼容性鼠标事件） */
  get hasActiveTouch(): boolean {
    return this.touch_id !== null;
  }
  boardHeld(): boolean {
    return this.r_down || this.m_down || (this.l_down && !this.face_down);
  }
  toggleFlagMode(): void {
    this.touch_flag_mode = !this.touch_flag_mode;
  }
  resetGesture(): void {
    this.press_cell = -1;
    this.chord_cell = -1;
    this.l_down = false;
    this.r_down = false;
    this.m_down = false;
    this.face_down = false;
    this.face_armed = false;
    this.clearLongPress();
    this.touch_id = null;
  }

  // ---------------------------------------------------------------- 共用动作
  private doExpand(c: number): void {
    const g = this.h.game;
    const m0 = g.moves;
    g.tryExpand(c);
    if (g.over) {
      this.h.onGameOver();
    }
    this.h.onAction({ flashFace: g.moves !== m0 && !g.over, startTimer: false });
  }

  private doReveal(c: number): void {
    const g = this.h.game;
    const covered = g.open[c] === 0;
    if (!g.started) {
      g.startAt(c, nowMs());
      if (!g.over) g.setMsg(Msg.started);
      if (g.over) this.h.onGameOver();
      this.h.onAction({ flashFace: covered && !g.over, startTimer: !g.over });
      return;
    }
    g.reveal(c, nowMs());
    if (g.over) this.h.onGameOver();
    this.h.onAction({ flashFace: covered && !g.over, startTimer: false });
  }

  private doCycleFlag(c: number): void {
    const g = this.h.game;
    if (g.over || g.open[c] !== 0) return;
    if (g.cycleFlag(c)) {
      this.h.onAction({ flashFace: true, startTimer: false });
    }
  }

  // ---------------------------------------------------------------- 鼠标
  onMouseDown(e: MouseEvent, px: number, py: number): void {
    const L = this.h.getLayout();
    const g = this.h.game;
    const c = cellAt(L, g, px, py);
    if (e.button === 0) {
      // 左键（含双击第二下）：只压住不翻开
      const on_face = inFace(L, px, py, counterShownFor(g));
      // 插旗模式：左键点按 = 循环插旗（与触屏一致），人脸重开除外
      if (this.touch_flag_mode && !on_face) {
        if (c >= 0) this.doCycleFlag(c);
        this.h.requestRender();
        return;
      }
      this.l_down = true;
      this.face_armed = on_face;
      this.face_down = on_face;
      if (this.r_down) {
        this.chord_cell = c;
        this.press_cell = -1;
      } else {
        this.press_cell = c >= 0 && !on_face && !g.over && g.open[c] === 0 ? c : -1;
      }
      this.h.requestRender();
    } else if (e.button === 2) {
      this.r_down = true;
      if (this.l_down) {
        this.chord_cell = c;
        this.press_cell = -1;
        this.h.requestRender();
        return;
      }
      if (c >= 0) this.doCycleFlag(c);
    } else if (e.button === 1) {
      this.m_down = true;
      this.chord_cell = c;
      this.press_cell = -1;
      this.h.requestRender();
    }
  }

  onMouseMove(px: number, py: number): void {
    const L = this.h.getLayout();
    const g = this.h.game;
    const c = cellAt(L, g, px, py);
    if (this.chord_cell >= 0) {
      const next = c >= 0 ? c : -1;
      if (next !== this.chord_cell) {
        this.chord_cell = next;
        this.h.requestRender();
      }
      return;
    }
    if (this.press_cell < 0) return;
    const next = c >= 0 && g.open[c] === 0 ? c : -1;
    if (next !== this.press_cell) {
      this.press_cell = next;
      this.h.requestRender();
    }
  }

  onMouseUp(e: MouseEvent, px: number, py: number): void {
    const L = this.h.getLayout();
    const g = this.h.game;
    if (e.button === 0) {
      const held = this.press_cell;
      const chord = this.chord_cell;
      const was_face = this.face_armed;
      this.l_down = false;
      this.press_cell = -1;
      this.chord_cell = -1;
      this.face_down = false;
      this.face_armed = false;
      // 人脸按钮：按下与松开都在脸上才算重开
      if (was_face && inFace(L, px, py, counterShownFor(g))) {
        this.h.onAction({ flashFace: false, startTimer: false, faceRestart: true });
        return;
      }
      if (chord >= 0) {
        if (cellAt(L, g, px, py) === chord) this.doExpand(chord);
        this.h.requestRender();
        return;
      }
      if (held >= 0 && cellAt(L, g, px, py) === held && !g.over && g.flag[held] === 0) {
        this.doReveal(held);
      }
      this.h.requestRender();
    } else if (e.button === 2) {
      this.r_down = false;
      const chord = this.chord_cell;
      if (chord >= 0) {
        this.chord_cell = -1;
        this.press_cell = -1;
        this.face_down = false;
        if (cellAt(L, g, px, py) === chord) this.doExpand(chord);
        this.h.requestRender();
      }
    } else if (e.button === 1) {
      const chord = this.chord_cell;
      this.m_down = false;
      this.chord_cell = -1;
      this.face_down = false;
      if (chord >= 0 && cellAt(L, g, px, py) === chord) this.doExpand(chord);
      this.h.requestRender();
    }
  }

  // ---------------------------------------------------------------- 触屏（Pointer Events）
  onPointerDown(e: PointerEvent, px: number, py: number): void {
    if (e.pointerType === 'mouse') return; // 鼠标走 onMouseDown
    if (this.touch_id !== null) return; // 只跟踪单指
    const L = this.h.getLayout();
    const g = this.h.game;
    const on_face = inFace(L, px, py, counterShownFor(g));
    this.touch_id = e.pointerId;
    this.touch_start_x = px;
    this.touch_start_y = py;
    this.touch_moved = false;
    this.touch_long_fired = false;
    this.face_armed = on_face;
    this.face_down = on_face;
    const c = cellAt(L, g, px, py);
    const now = nowMs();
    const dbl =
      c >= 0 &&
      now - this.last_tap_t < DOUBLE_TAP_MS &&
      this.last_tap_cell === c &&
      g.open[c] !== 0;
    if (!on_face && dbl) {
      this.chord_cell = c; // 双击按住已开格：预览即将展开的邻格，抬手展开
      this.press_cell = -1;
    } else if (this.touch_flag_mode) {
      // 插旗模式下点按 = 循环插旗，不做翻开预览
      this.press_cell = -1;
    } else if (!on_face && c >= 0 && !g.over && g.open[c] === 0) {
      this.press_cell = c;
    } else {
      this.press_cell = -1;
    }
    this.h.requestRender();
    // 长按 = 插旗
    this.touch_long_timer = window.setTimeout(() => {
      if (this.touch_id === null || this.touch_moved) return;
      this.touch_long_fired = true;
      this.press_cell = -1;
      this.face_down = false;
      if (c >= 0) this.doCycleFlag(c);
      this.h.requestRender();
    }, LONG_PRESS_MS);
  }

  onPointerMove(e: PointerEvent, px: number, py: number): void {
    if (e.pointerType === 'mouse' || this.touch_id !== e.pointerId) return;
    const dx = px - this.touch_start_x;
    const dy = py - this.touch_start_y;
    if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) {
      this.touch_moved = true;
      this.clearLongPress();
      this.face_down = false;
    }
    if (this.chord_cell >= 0) {
      const L = this.h.getLayout();
      const g = this.h.game;
      const c = cellAt(L, g, px, py);
      const next = c >= 0 ? c : -1;
      if (next !== this.chord_cell) {
        this.chord_cell = next;
        this.h.requestRender();
      }
      return;
    }
    // 按下预览跟着手指走
    if (this.press_cell >= 0) {
      const L = this.h.getLayout();
      const g = this.h.game;
      const c = cellAt(L, g, px, py);
      const next = c >= 0 && g.open[c] === 0 ? c : -1;
      if (next !== this.press_cell) {
        this.press_cell = next;
        this.h.requestRender();
      }
    }
  }

  onPointerUp(e: PointerEvent, px: number, py: number): void {
    if (e.pointerType === 'mouse' || this.touch_id !== e.pointerId) return;
    this.clearLongPress();
    const L = this.h.getLayout();
    const g = this.h.game;
    const held = this.press_cell;
    const chord = this.chord_cell;
    const was_face = this.face_armed;
    this.press_cell = -1;
    this.chord_cell = -1;
    this.face_down = false;
    this.face_armed = false;
    this.touch_id = null;

    if (this.touch_long_fired) {
      this.h.requestRender();
      return;
    }
    if (chord >= 0) {
      // 与鼠标版一致：手势被位移打断就不展开
      if (!this.touch_moved && cellAt(L, g, px, py) === chord) this.doExpand(chord);
      this.last_tap_t = 0;
      this.last_tap_cell = -1;
      this.h.requestRender();
      return;
    }
    // 人脸重开
    if (was_face && inFace(L, px, py, counterShownFor(g))) {
      this.h.onAction({ flashFace: false, startTimer: false, faceRestart: true });
      return;
    }
    const c = cellAt(L, g, px, py);
    if (c < 0 || this.touch_moved) {
      this.h.requestRender();
      return;
    }
    this.last_tap_t = nowMs();
    this.last_tap_cell = c;

    if (this.touch_flag_mode) {
      this.doCycleFlag(c);
      this.h.requestRender();
      return;
    }
    if (held >= 0 && held === c && g.flag[c] === 0) {
      this.doReveal(c);
    }
    this.h.requestRender();
  }

  onMouseLeave(): void {
    if (this.face_down || this.face_armed || this.press_cell >= 0 || this.chord_cell >= 0) {
      this.face_down = false;
      this.face_armed = false;
      this.press_cell = -1;
      this.chord_cell = -1;
      this.h.requestRender();
    }
  }

  onPointerCancel(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || this.touch_id !== e.pointerId) return;
    this.clearLongPress();
    this.press_cell = -1;
    this.chord_cell = -1;
    this.face_down = false;
    this.face_armed = false;
    this.touch_id = null;
    this.h.requestRender();
  }

  private clearLongPress(): void {
    if (this.touch_long_timer !== null) {
      clearTimeout(this.touch_long_timer);
      this.touch_long_timer = null;
    }
  }
}

export function nowMs(): number {
  return Math.floor(performance.now());
}
