// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import { Game } from '../src/game/game';
import { InputController } from '../src/input/input';
import { makeLayout } from '../src/render/layout';
import { loadScores } from '../src/app/storage';
import { closeDialog, isDialogOpen, showCustomDialog, showScores } from '../src/app/dialogs';

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
