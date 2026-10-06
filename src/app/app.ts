// 装配：游戏状态、计时器、渲染循环、工具条与输入的接线。

import { Game } from '../game/game';
import { PRESETS, type GameMode } from '../game/constants';
import { Atlas } from '../render/atlas';
import { Renderer } from '../render/renderer';
import { makeLayout } from '../render/layout';
import { InputController, nowMs } from '../input/input';
import { loadScores, mergeScores, saveScores, type Scores } from './storage';
import { isDialogOpen, showAbout, showCustomDialog, showHelp, showScores } from './dialogs';
import { APP_TITLE, APP_VERSION } from './strings';
import { GameAudio } from './audio';

const FACE_FLASH_MS = 200;

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private game = new Game();
  private atlas = new Atlas();
  private renderer!: Renderer;
  private input!: InputController;
  private zoom = 2;
  private selected_preset = 0;
  private scores: Record<GameMode, Scores> = { complex: loadScores(), hyper: loadScores('hyper') };
  private audio = new GameAudio();
  private sound_enabled = true;
  private over_sound_done = false;
  private tick_second = 0;
  private timer_id: number | null = null;
  private face_flash_until = 0;
  private raf_pending = false;
  private last_touch_at = -Infinity;
  private pen_buttons = 0;
  private pen_pointer_id: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    await this.atlas.load('assets/atlas.png', 'assets/atlas.json');
    this.renderer = new Renderer(this.atlas);
    this.input = new InputController({
      game: this.game,
      getLayout: () => makeLayout(this.zoom, this.game),
      onAction: (opts) => this.afterAction(opts),
      onGameOver: () => this.onGameOver(),
      requestRender: () => this.requestRender(),
    });
    this.bindInput();
    this.bindToolbar();
    this.syncToolbar();
    this.game.newGame(this.randomSeed());
    this.fitCanvas();
    this.requestRender();
    window.addEventListener('resize', () => {
      this.fitCanvas();
      this.requestRender();
    });
  }

  // ---------------------------------------------------------------- 尺寸与渲染
  private fitCanvas(): void {
    const L = makeLayout(this.zoom, this.game);
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    this.canvas.style.width = `${L.client_w}px`;
    this.canvas.style.height = `${L.client_h}px`;
    this.canvas.width = L.client_w * dpr;
    this.canvas.height = L.client_h * dpr;
  }

  requestRender(): void {
    if (this.raf_pending) return;
    this.raf_pending = true;
    requestAnimationFrame(() => {
      this.raf_pending = false;
      this.render();
    });
  }

  private render(): void {
    const L = makeLayout(this.zoom, this.game);
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false; // 最近邻，像素风
    this.renderer.paint(this.ctx, this.game, L, {
      pressCell: this.input.pressCell,
      chordCell: this.input.chordCell,
      faceDown: this.input.faceDown,
      boardHeld: this.input.boardHeld(),
      faceFlashUntil: this.face_flash_until,
      now: nowMs(),
      timerSeconds: this.timerSeconds(),
    });
  }

  // ---------------------------------------------------------------- 计时与纪录
  private timerSeconds(): number {
    if (!this.game.started) return 0;
    return Math.min(9999, Math.floor(this.game.elapsed_ms / 1000));
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer_id = window.setInterval(() => {
      if (this.game.started && !this.game.over) {
        this.game.elapsed_ms = nowMs() - this.game.t0;
        const sec = this.timerSeconds();
        if (sec >= 1 && sec !== this.tick_second) {
          this.tick_second = sec;
          this.audio.play('tick');
        }
        this.requestRender();
      }
    }, 250);
  }

  private stopTimer(): void {
    if (this.timer_id !== null) {
      clearInterval(this.timer_id);
      this.timer_id = null;
    }
  }

  private presetIndex(): number {
    return this.selected_preset;
  }

  onGameOver(): void {
    this.stopTimer();
    if (this.game.t0 !== 0) this.game.elapsed_ms = nowMs() - this.game.t0;
    if (!this.over_sound_done) {
      this.over_sound_done = true;
      if (this.game.win) this.audio.play('win');
      else if (this.game.boom >= 0) {
        const type = this.game.mine[this.game.boom];
        if (type >= 1 && type <= 4) this.audio.play(`mine_${type}` as 'mine_1' | 'mine_2' | 'mine_3' | 'mine_4');
      }
    }
    if (!this.game.win) return;
    const idx = this.presetIndex();
    if (idx < 0) return;
    const mode = this.game.mode;
    const scores = mergeScores(this.scores[mode], loadScores(mode));
    this.scores[mode] = scores;
    const sec = Math.max(1, Math.floor(this.game.elapsed_ms / 1000));
    if (scores.best[idx] !== 0 && sec >= scores.best[idx]) return;
    scores.best[idx] = sec;
    this.scores[mode] = saveScores(scores, mode);
    if (this.scores[mode].best[idx] === sec) showScores(this.scores[mode], true, mode);
  }

  private afterAction(opts: { flashFace: boolean; startTimer: boolean; faceRestart?: boolean }): void {
    if (opts.faceRestart) {
      this.newGame();
      return;
    }
    if (opts.startTimer) this.startTimer();
    if (opts.flashFace) {
      this.face_flash_until = nowMs() + FACE_FLASH_MS;
      window.setTimeout(() => this.requestRender(), FACE_FLASH_MS);
    }
    this.requestRender();
  }

  // ---------------------------------------------------------------- 对局控制
  private randomSeed(): number {
    return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
  }

  newGame(): void {
    this.stopTimer();
    this.audio.stop();
    this.over_sound_done = false;
    this.tick_second = 0;
    this.face_flash_until = 0;
    this.resetInput();
    this.game.newGame(this.randomSeed());
    const viewport = this.canvas.parentElement;
    if (viewport?.id === 'board-viewport') {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
    this.requestRender();
  }

  setPreset(idx: number, mode: GameMode = this.game.mode): void {
    const p = PRESETS[idx];
    this.game.mode = mode;
    this.selected_preset = idx;
    this.game.w = p.w;
    this.game.h = p.h;
    this.game.mines = p.mines;
    this.game.type_count.fill(0);
    this.fitCanvas();
    this.newGame();
    this.syncToolbar();
  }

  setZoom(z: number): void {
    this.resetInput();
    this.zoom = z;
    this.fitCanvas();
    this.syncToolbar();
    this.requestRender();
  }

  async openCustomDialog(mode: GameMode = this.game.mode): Promise<void> {
    this.resetInput();
    this.requestRender();
    const res = await showCustomDialog({
      w: this.game.w,
      h: this.game.h,
      mines: this.game.mines,
      typeCount: Array.from(this.game.type_count),
    }, mode);
    if (!res.applied || !res.config) return;
    this.game.mode = mode;
    this.selected_preset = -1;
    this.game.w = res.config.w;
    this.game.h = res.config.h;
    this.game.mines = res.config.mines;
    this.game.type_count.set(res.config.typeCount);
    this.fitCanvas();
    this.newGame();
    this.syncToolbar();
  }

  showScores(mode: GameMode = this.game.mode): void {
    this.resetInput();
    this.requestRender();
    this.scores[mode] = mergeScores(this.scores[mode], loadScores(mode));
    showScores(this.scores[mode], false, mode);
  }

  /** 只读调试状态（E2E 冒烟断言用） */
  debugState(): string {
    return JSON.stringify({
      w: this.game.w,
      h: this.game.h,
      mines: this.game.mines,
      mode: this.game.mode,
      started: this.game.started,
      over: this.game.over,
      win: this.game.win,
      opened: this.game.openedCount(),
      flags: this.game.flagsTotal(),
      typeTotal: Array.from(this.game.type_total),
    });
  }
  showHelp(): void {
    this.resetInput();
    this.requestRender();
    showHelp();
  }
  showAbout(): void {
    this.resetInput();
    this.requestRender();
    showAbout();
  }

  // ---------------------------------------------------------------- 输入接线
  private resetInput(): void {
    this.pen_buttons = 0;
    this.pen_pointer_id = null;
    this.input.resetGesture();
  }

  private canvasPos(e: MouseEvent | PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindInput(): void {
    const updatePen = (buttons: number, x: number, y: number): void => {
      this.input.onMouseMove(x, y);
      for (const [mask, button] of [[1, 0], [2, 2], [4, 1]]) {
        if ((buttons & mask) && !(this.pen_buttons & mask)) this.input.onMouseDown({ button } as MouseEvent, x, y);
      }
      for (const [mask, button] of [[1, 0], [2, 2], [4, 1]]) {
        if (!(buttons & mask) && (this.pen_buttons & mask)) this.input.onMouseUp({ button } as MouseEvent, x, y);
      }
      this.pen_buttons = buttons;
    };
    const cancelGesture = (): void => {
      this.resetInput();
      this.requestRender();
    };
    const fromTouch = (e: MouseEvent): boolean => {
      const capabilities = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } | null }).sourceCapabilities;
      return capabilities ? capabilities.firesTouchEvents : this.input.hasActiveTouch || nowMs() - this.last_touch_at < 800;
    };
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      // Compatibility mouse events can arrive after pointerup has cleared the touch.
      if (fromTouch(e)) return;
      this.audio.unlock();
      const [x, y] = this.canvasPos(e);
      this.input.onMouseDown(e, x, y);
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (fromTouch(e)) return;
      const [x, y] = this.canvasPos(e);
      this.input.onMouseMove(x, y);
    });
    window.addEventListener('mouseup', (e) => {
      if (fromTouch(e)) return;
      const [x, y] = this.canvasPos(e);
      this.input.onMouseUp(e, x, y);
    });
    this.canvas.addEventListener('mouseleave', () => this.input.onMouseLeave());
    // 触屏（Pointer Events）
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.audio.unlock();
      const [x, y] = this.canvasPos(e);
      if (e.pointerType === 'pen') {
        this.pen_pointer_id = e.pointerId;
        updatePen(e.buttons, x, y);
        if (e.isPrimary) this.canvas.setPointerCapture(e.pointerId);
      } else {
        this.last_touch_at = nowMs();
        this.input.onPointerDown(e, x, y);
        if (this.input.hasActiveTouch && e.isPrimary) this.canvas.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = this.canvasPos(e);
      if (e.pointerType === 'pen') {
        if (this.pen_pointer_id === e.pointerId) updatePen(e.buttons, x, y);
      } else this.input.onPointerMove(e, x, y);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = this.canvasPos(e);
      if (e.pointerType === 'pen') {
        if (this.pen_pointer_id === e.pointerId) {
          updatePen(e.buttons, x, y);
          this.pen_pointer_id = null;
        }
      } else {
        this.last_touch_at = nowMs();
        this.input.onPointerUp(e, x, y);
      }
    });
    this.canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'pen') {
        if (this.pen_pointer_id === e.pointerId) cancelGesture();
      } else {
        if (e.pointerType !== 'mouse') this.last_touch_at = nowMs();
        this.input.onPointerCancel(e);
      }
    });
    this.canvas.addEventListener('lostpointercapture', (e) => {
      if (e.pointerType === 'pen') {
        if (this.pen_pointer_id === e.pointerId) cancelGesture();
      } else this.input.onPointerCancel(e);
    });
    window.addEventListener('blur', cancelGesture);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelGesture();
    });
    // F2 开局
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (!isDialogOpen()) {
          this.audio.unlock();
          this.newGame();
        }
      }
    });
  }

  private bindToolbar(): void {
    const on = (id: string, fn: () => void): void => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.audio.unlock();
        const menu = document.getElementById(id)?.closest('details');
        if (menu instanceof HTMLDetailsElement) {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        }
        fn();
      });
    };
    on('btn-new', () => this.newGame());
    for (const mode of ['complex', 'hyper'] as const) {
      const prefix = mode === 'hyper' ? 'btn-hyper-' : 'btn-';
      ['beginner', 'intermediate', 'expert'].forEach((name, index) => {
        on(`${prefix}${name}`, () => this.setPreset(index, mode));
      });
      on(`${prefix}custom`, () => void this.openCustomDialog(mode));
      on(`${prefix}scores`, () => this.showScores(mode));
    }
    on('btn-help', () => this.showHelp());
    on('btn-about', () => this.showAbout());
    on('btn-zoom-1', () => this.setZoom(1));
    on('btn-zoom-2', () => this.setZoom(2));
    on('btn-zoom-3', () => this.setZoom(3));
    on('btn-flag-mode', () => {
      this.input.toggleFlagMode();
      const button = document.getElementById('btn-flag-mode');
      button?.classList.toggle('active', this.input.flagMode);
      button?.setAttribute('aria-pressed', String(this.input.flagMode));
    });
    document.getElementById('btn-flag-mode')?.setAttribute('aria-pressed', String(this.input.flagMode));
    on('btn-sound', () => {
      this.sound_enabled = !this.sound_enabled;
      this.audio.setMuted(!this.sound_enabled);
      this.syncToolbar();
    });
    const menus = Array.from(document.querySelectorAll<HTMLDetailsElement>('.mode-menu'));
    const closeMenus = (): void => { menus.forEach((menu) => { menu.open = false; }); };
    // summary 的 click 在浏览器切换 open 之前发生，立即关闭其它菜单。
    // toggle 事件会排队；用它互斥会让旧事件反过来关闭刚点开的菜单。
    menus.forEach((menu) => menu.querySelector('summary')?.addEventListener('click', () => {
      menus.forEach((other) => { if (other !== menu) other.open = false; });
    }));
    document.addEventListener('click', (e) => {
      if (e.target instanceof Node && !menus.some((menu) => menu.contains(e.target as Node))) closeMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = menus.find((menu) => menu.open);
        closeMenus();
        open?.querySelector('summary')?.focus();
      }
    });
  }

  private syncToolbar(): void {
    for (const mode of ['complex', 'hyper'] as const) {
      const current = this.game.mode === mode;
      const summary = document.querySelector(`#menu-${mode} summary`);
      summary?.classList.toggle('active', current);
      const prefix = mode === 'hyper' ? 'btn-hyper-' : 'btn-';
      ['beginner', 'intermediate', 'expert', 'custom'].forEach((name, i) => {
        const selected = current && (i === 3 ? this.selected_preset < 0 : this.selected_preset === i);
        const button = document.getElementById(`${prefix}${name}`);
        button?.classList.toggle('active', selected);
        button?.setAttribute('aria-pressed', String(selected));
      });
    }
    const sound = document.getElementById('btn-sound');
    sound?.classList.toggle('active', this.sound_enabled);
    sound?.setAttribute('aria-pressed', String(this.sound_enabled));
    if (sound) sound.textContent = this.sound_enabled ? '音效：开' : '音效：关';
    for (const zoom of [1, 2, 3]) {
      const button = document.getElementById(`btn-zoom-${zoom}`);
      button?.classList.toggle('active', this.zoom === zoom);
      button?.setAttribute('aria-pressed', String(this.zoom === zoom));
    }
  }
}

export { APP_TITLE, APP_VERSION };
