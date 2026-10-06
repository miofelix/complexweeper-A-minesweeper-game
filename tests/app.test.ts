// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import { Game } from '../src/game/game';
import { InputController } from '../src/input/input';
import { makeLayout } from '../src/render/layout';
import { loadScores, saveScores } from '../src/app/storage';
import { closeDialog, isDialogOpen, showCustomDialog, showScores } from '../src/app/dialogs';
import { GameAudio } from '../src/app/audio';

vi.mock('../src/app/dialogs', () => ({
  showScores: vi.fn(),
  showCustomDialog: vi.fn(),
  showHelp: vi.fn(),
  showAbout: vi.fn(),
  closeDialog: vi.fn(),
  isDialogOpen: vi.fn(() => false),
}));

function makeApp(): App {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  const app = new App(canvas);
  vi.spyOn(app, 'requestRender').mockImplementation(() => {});
  const internal = app as unknown as { game: Game; input: InputController };
  internal.input = new InputController({
    game: internal.game,
    getLayout: () => makeLayout(2, internal.game),
    onAction: () => {},
    onGameOver: () => {},
    requestRender: () => {},
  });
  return app;
}

function win(app: App): void {
  const game = (app as unknown as { game: Game }).game;
  game.started = true;
  game.over = true;
  game.win = true;
  game.elapsed_ms = 12000;
  app.onGameOver();
}

beforeEach(() => {
  const records = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  });
  vi.clearAllMocks();
});

afterEach(() => {
  closeDialog();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('score eligibility', () => {
  it('does not announce a slower stale-tab win as a new record', () => {
    const app = makeApp();
    saveScores({ best: [8, 24, 35] });
    win(app);
    expect(loadScores().best).toEqual([8, 24, 35]);
    expect(showScores).not.toHaveBeenCalled();
    app.showScores();
    expect(showScores).toHaveBeenLastCalledWith({ best: [8, 24, 35] }, false, 'complex');
  });

  it('retains records from other tabs when a new faster score is saved', () => {
    const app = makeApp();
    saveScores({ best: [20, 24, 35] });
    win(app);
    expect(loadScores().best).toEqual([12, 24, 35]);
    expect(showScores).toHaveBeenLastCalledWith({ best: [12, 24, 35] }, true, 'complex');
  });

  it('keeps an in-memory record visible when persistent storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage denied'); },
      setItem: () => { throw new Error('Storage denied'); },
    });
    const app = makeApp();
    win(app);
    app.showScores();
    expect(showScores).toHaveBeenLastCalledWith({ best: [12, 0, 0] }, false, 'complex');
  });
  it('records wins from each selected standard preset', () => {
    const app = makeApp();
    for (let preset = 0; preset < 3; preset++) {
      app.setPreset(preset);
      win(app);
    }
    expect(loadScores().best).toEqual([12, 12, 12]);
    expect(showScores).toHaveBeenCalledTimes(3);
  });

  it('excludes standard-shaped custom games, including after restart', async () => {
    const app = makeApp();
    vi.mocked(showCustomDialog).mockResolvedValue({
      applied: true,
      config: { w: 9, h: 9, mines: 10, typeCount: [0, 10, 0, 0, 0] },
    });
    await app.openCustomDialog();
    win(app);
    app.newGame();
    win(app);
    expect(loadScores().best).toEqual([0, 0, 0]);
    expect(showScores).not.toHaveBeenCalled();

    app.setPreset(0);
    win(app);
    expect(loadScores().best).toEqual([12, 0, 0]);
  });

  it('keeps the selected preset eligible when customization is cancelled', async () => {
    const app = makeApp();
    app.setPreset(1);
    vi.mocked(showCustomDialog).mockResolvedValue({ applied: false });
    await app.openCustomDialog();
    win(app);
    expect(loadScores().best).toEqual([0, 12, 0]);
  });

  it('records modes separately and shows another mode without changing the board', () => {
    const app = makeApp();
    saveScores({ best: [8, 24, 35] });
    app.setPreset(1, 'hyper');
    win(app);
    expect(loadScores('hyper').best).toEqual([0, 12, 0]);
    expect(loadScores().best).toEqual([8, 24, 35]);
    expect(showScores).toHaveBeenLastCalledWith({ best: [0, 12, 0] }, true, 'hyper');
    app.showScores('complex');
    expect(showScores).toHaveBeenLastCalledWith({ best: [8, 24, 35] }, false, 'complex');
    expect(JSON.parse(app.debugState()).mode).toBe('hyper');
    app.newGame();
    expect(JSON.parse(app.debugState()).mode).toBe('hyper');
  });

  it('retains in-memory records for both modes when storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage denied'); },
      setItem: () => { throw new Error('Storage denied'); },
    });
    const app = makeApp();
    win(app);
    app.setPreset(1, 'hyper');
    win(app);
    app.showScores('complex');
    expect(showScores).toHaveBeenLastCalledWith({ best: [12, 0, 0] }, false, 'complex');
    app.showScores('hyper');
    expect(showScores).toHaveBeenLastCalledWith({ best: [0, 12, 0] }, false, 'hyper');
  });

  it('applies custom settings to the requested mode and preserves the board on cancellation', async () => {
    const app = makeApp();
    vi.mocked(showCustomDialog).mockResolvedValue({ applied: false });
    await app.openCustomDialog('hyper');
    expect(JSON.parse(app.debugState()).mode).toBe('complex');
    vi.mocked(showCustomDialog).mockResolvedValue({
      applied: true, config: { w: 9, h: 9, mines: 10, typeCount: [0, 3, 3, 2, 2] },
    });
    await app.openCustomDialog('hyper');
    expect(showCustomDialog).toHaveBeenLastCalledWith(expect.objectContaining({ w: 9, h: 9 }), 'hyper');
    expect(JSON.parse(app.debugState()).mode).toBe('hyper');
    win(app);
    expect(loadScores('hyper').best).toEqual([0, 0, 0]);
    expect(showScores).not.toHaveBeenCalled();
  });
});

describe('audio integration', () => {
  it('plays each mine type once per loss and allows another ending after restart', () => {
    const play = vi.spyOn(GameAudio.prototype, 'play').mockImplementation(() => {});
    const stop = vi.spyOn(GameAudio.prototype, 'stop').mockImplementation(() => {});
    const app = makeApp();
    const game = (app as unknown as { game: Game }).game;
    for (let type = 1; type <= 4; type++) {
      app.newGame();
      game.mine[0] = type;
      game.lose(0);
      app.onGameOver();
      app.onGameOver();
      expect(play).toHaveBeenLastCalledWith(`mine_${type}`);
    }
    expect(play).toHaveBeenCalledTimes(4);
    expect(stop).toHaveBeenCalledTimes(4);
    app.newGame();
    win(app);
    app.onGameOver();
    expect(play).toHaveBeenLastCalledWith('win');
    expect(play).toHaveBeenCalledTimes(5);
  });

  it('ticks once on a new elapsed second and stops ticking when the game ends', () => {
    vi.useFakeTimers();
    try {
      const play = vi.spyOn(GameAudio.prototype, 'play').mockImplementation(() => {});
      const app = makeApp();
      const internal = app as unknown as { game: Game; startTimer(): void };
      internal.game.started = true;
      internal.game.t0 = 0;
      const time = vi.spyOn(performance, 'now').mockReturnValue(500);
      internal.startTimer();
      vi.advanceTimersByTime(250);
      expect(play).not.toHaveBeenCalled();
      time.mockReturnValue(1050);
      vi.advanceTimersByTime(500);
      expect(play).toHaveBeenCalledTimes(1);
      time.mockReturnValue(5050);
      vi.advanceTimersByTime(250);
      expect(play).toHaveBeenCalledTimes(2);
      expect(play).toHaveBeenLastCalledWith('tick');
      time.mockReturnValue(9999500);
      vi.advanceTimersByTime(250);
      expect(play).toHaveBeenCalledTimes(3);
      time.mockReturnValue(10000500);
      vi.advanceTimersByTime(500);
      expect(play).toHaveBeenCalledTimes(3);
      internal.game.lose(0);
      app.onGameOver();
      vi.advanceTimersByTime(2000);
      expect(play).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('modal keyboard handling', () => {
  it('keeps F2 from restarting while a dialog is open', () => {
    const app = makeApp();
    const newGame = vi.spyOn(app, 'newGame');
    (app as unknown as { bindInput(): void }).bindInput();
    vi.mocked(isDialogOpen).mockReturnValue(true);
    const blocked = new KeyboardEvent('keydown', { key: 'F2', cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    expect(newGame).not.toHaveBeenCalled();

    vi.mocked(isDialogOpen).mockReturnValue(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', cancelable: true }));
    expect(newGame).toHaveBeenCalledTimes(1);
  });
});

describe('pen controls', () => {
  function penSetup() {
    const app = makeApp();
    const internal = app as unknown as { canvas: HTMLCanvasElement; input: InputController; game: Game; bindInput(): void };
    internal.canvas.setPointerCapture = vi.fn();
    internal.bindInput();
    const layout = makeLayout(2, internal.game);
    const dispatch = (type: string, button: number, buttons = type === 'pointerdown' ? [1, 4, 2][button] : 0) => {
      const event = new MouseEvent(type, {
        button, buttons, clientX: layout.board_x + 16, clientY: layout.board_y + 16,
        bubbles: true, cancelable: true,
      });
      Object.defineProperties(event, {
        pointerType: { value: 'pen' }, pointerId: { value: 99 }, isPrimary: { value: true },
      });
      internal.canvas.dispatchEvent(event);
    };
    return { ...internal, app, dispatch };
  }

  it('uses the pen barrel button to flag without revealing', () => {
    const { game, dispatch } = penSetup();
    dispatch('pointerdown', 2);
    dispatch('pointerup', 2);
    expect(game.flag[0]).toBe(1);
    expect(game.started).toBe(false);
  });

  it('reveals with the tip and honours flag mode', () => {
    const { game, input, dispatch } = penSetup();
    input.toggleFlagMode();
    dispatch('pointerdown', 0);
    dispatch('pointerup', 0);
    expect(game.flag[0]).toBe(1);
    expect(game.started).toBe(false);
    game.setFlag(0, 0);
    input.toggleFlagMode();
    dispatch('pointerdown', 0);
    dispatch('pointerup', 0);
    expect(game.started).toBe(true);
  });

  it('consumes a chord when the pen barrel button changes during tip contact', () => {
    const { game, input, dispatch } = penSetup();
    dispatch('pointerdown', 0, 1);
    expect(input.pressCell).toBe(0);
    dispatch('pointermove', 2, 3);
    expect(input.pressCell).toBe(-1);
    expect(input.chordCell).toBe(0);
    dispatch('pointermove', 2, 1);
    dispatch('pointerup', 0, 0);
    expect(game.started).toBe(false);
    expect(game.flagsTotal()).toBe(0);
    expect(input.boardHeld()).toBe(false);
    dispatch('pointerdown', 0, 1);
    dispatch('pointerup', 0, 0);
    expect(game.started).toBe(true);
  });

  it.each(['pointercancel', 'lostpointercapture'])('cancels a pen press on %s', (type) => {
    const { game, input, dispatch } = penSetup();
    dispatch('pointerdown', 0);
    expect(input.pressCell).toBe(0);
    dispatch(type, 0);
    expect(input.pressCell).toBe(-1);
    dispatch('pointermove', -1, 1);
    dispatch('pointerup', 0);
    expect(game.started).toBe(false);
    dispatch('pointerdown', 0);
    dispatch('pointerup', 0);
    expect(game.started).toBe(true);
  });

  it.each(['restart', 'zoom', 'help'])('does not carry pen button state across %s', (action) => {
    const { app, game, dispatch } = penSetup();
    dispatch('pointerdown', 0, 1);
    if (action === 'restart') app.newGame();
    if (action === 'zoom') app.setZoom(1);
    if (action === 'help') app.showHelp();
    dispatch('pointermove', 2, 3);
    dispatch('pointerup', 0, 0);
    expect(game.flagsTotal()).toBe(0);
    expect(game.started).toBe(false);
  });
});
