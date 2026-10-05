// 装配：游戏状态、计时器、渲染循环、工具条与输入的接线。

import { Game } from '../game/game';
import { PRESETS } from '../game/constants';
import { Atlas } from '../render/atlas';
import { Renderer } from '../render/renderer';
import { makeLayout } from '../render/layout';
import { InputController, nowMs } from '../input/input';
import { loadScores, saveScores, type Scores } from './storage';
import { showAbout, showCustomDialog, showHelp, showScores } from './dialogs';
import { APP_TITLE, APP_VERSION } from './strings';

const FACE_FLASH_MS = 200;

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private game = new Game();
  private atlas = new Atlas();
  private renderer!: Renderer;
  private input!: InputController;
  private zoom = 2;
  private scores: Scores = loadScores();
  private timer_id: number | null = null;
  private face_flash_until = 0;
  private raf_pending = false;

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
    for (let i = 0; i < PRESETS.length; i++) {
      const p = PRESETS[i];
      if (this.game.w === p.w && this.game.h === p.h && this.game.mines === p.mines) return i;
    }
    return -1;
  }

  onGameOver(): void {
    this.stopTimer();
    if (this.game.t0 !== 0) this.game.elapsed_ms = nowMs() - this.game.t0;
    if (!this.game.win) return;
    const idx = this.presetIndex();
    if (idx < 0) return;
    const sec = Math.max(1, Math.floor(this.game.elapsed_ms / 1000));
    if (this.scores.best[idx] !== 0 && sec >= this.scores.best[idx]) return;
    this.scores.best[idx] = sec;
    saveScores(this.scores);
    showScores(this.scores, true);
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
    this.face_flash_until = 0;
    this.input.resetGesture();
    this.game.newGame(this.randomSeed());
    this.requestRender();
  }

  setPreset(idx: number): void {
    const p = PRESETS[idx];
    this.game.w = p.w;
    this.game.h = p.h;
    this.game.mines = p.mines;
    this.game.type_count.fill(0);
    this.fitCanvas();
    this.newGame();
  }

  setZoom(z: number): void {
    this.zoom = z;
    this.fitCanvas();
    this.requestRender();
  }

  async openCustomDialog(): Promise<void> {
    const res = await showCustomDialog({
      w: this.game.w,
      h: this.game.h,
      mines: this.game.mines,
      typeCount: Array.from(this.game.type_count),
    });
    if (!res.applied || !res.config) return;
    this.game.w = res.config.w;
    this.game.h = res.config.h;
    this.game.mines = res.config.mines;
    this.game.type_count.set(res.config.typeCount);
    this.fitCanvas();
    this.newGame();
  }

  showScores(): void {
    showScores(this.scores, false);
  }

  /** 只读调试状态（E2E 冒烟断言用） */
  debugState(): string {
    return JSON.stringify({
      w: this.game.w,
      h: this.game.h,
      mines: this.game.mines,
      started: this.game.started,
      over: this.game.over,
      win: this.game.win,
      opened: this.game.openedCount(),
      typeTotal: Array.from(this.game.type_total),
    });
  }
  showHelp(): void {
    showHelp();
  }
  showAbout(): void {
    showAbout();
  }

  // ---------------------------------------------------------------- 输入接线
  private canvasPos(e: MouseEvent | PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindInput(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      const [x, y] = this.canvasPos(e);
      this.input.onMouseDown(e, x, y);
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      const [x, y] = this.canvasPos(e);
      this.input.onMouseMove(x, y);
    });
    window.addEventListener('mouseup', (e) => {
      const [x, y] = this.canvasPos(e);
      this.input.onMouseUp(e, x, y);
    });
    this.canvas.addEventListener('mouseleave', () => this.input.onMouseLeave());
    // 触屏（Pointer Events）
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = this.canvasPos(e);
      this.input.onPointerDown(e, x, y);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = this.canvasPos(e);
      this.input.onPointerMove(e, x, y);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const [x, y] = this.canvasPos(e);
      this.input.onPointerUp(e, x, y);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointercancel', (e) => this.input.onPointerCancel(e));
    // F2 开局
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        this.newGame();
        e.preventDefault();
      }
    });
  }

  private bindToolbar(): void {
    const on = (id: string, fn: () => void): void => {
      document.getElementById(id)?.addEventListener('click', fn);
    };
    on('btn-new', () => this.newGame());
    on('btn-beginner', () => this.setPreset(0));
    on('btn-intermediate', () => this.setPreset(1));
    on('btn-expert', () => this.setPreset(2));
    on('btn-custom', () => void this.openCustomDialog());
    on('btn-scores', () => this.showScores());
    on('btn-help', () => this.showHelp());
    on('btn-about', () => this.showAbout());
    on('btn-zoom-1', () => this.setZoom(1));
    on('btn-zoom-2', () => this.setZoom(2));
    on('btn-zoom-3', () => this.setZoom(3));
    on('btn-flag-mode', () => {
      this.input.toggleFlagMode();
      document.getElementById('btn-flag-mode')?.classList.toggle('active', this.input.flagMode);
    });
  }
}

export { APP_TITLE, APP_VERSION };
