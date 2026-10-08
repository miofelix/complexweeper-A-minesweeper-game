// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import { GameAudio } from '../src/app/audio';
import { showCustomDialog, showScores } from '../src/app/dialogs';
import { loadSoundEnabled, saveScores, saveSoundEnabled } from '../src/app/storage';
import type { GameMode } from '../src/game/constants';
import type { Game } from '../src/game/game';
import { InputController } from '../src/input/input';
import { makeLayout } from '../src/render/layout';

vi.mock('../src/app/dialogs', () => ({
  showScores: vi.fn(),
  showCustomDialog: vi.fn(),
  showHelp: vi.fn(),
  showAbout: vi.fn(),
  isDialogOpen: vi.fn(() => false),
}));

const html = readFileSync(resolve('index.html'), 'utf8');
const listeners: Array<[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];

function element<T extends HTMLElement = HTMLButtonElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing toolbar element: ${id}`);
  return found as T;
}

function makeToolbar(): { app: App; game: Game } {
  const canvas = element<HTMLCanvasElement>('board');
  vi.spyOn(canvas, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  const app = new App(canvas);
  vi.spyOn(app, 'requestRender').mockImplementation(() => {});
  const internal = app as unknown as {
    game: Game;
    input: InputController;
    bindToolbar(): void;
    syncToolbar(): void;
  };
  internal.input = new InputController({
    game: internal.game,
    getLayout: () => makeLayout(2, internal.game),
    onAction: () => {},
    onGameOver: () => app.onGameOver(),
    requestRender: () => app.requestRender(),
  });
  const registration = vi.spyOn(document, 'addEventListener');
  const previousCalls = registration.mock.calls.length;
  internal.bindToolbar();
  for (const [type, listener, options] of registration.mock.calls.slice(previousCalls)) {
    listeners.push([type, listener, options]);
  }
  internal.syncToolbar();
  return { app, game: internal.game };
}

function expectSelected(mode: GameMode, difficulty: string): void {
  const selectedId = `btn-${mode === 'hyper' ? 'hyper-' : ''}${difficulty}`;
  const options = Array.from(document.querySelectorAll<HTMLButtonElement>('.mode-options button[aria-pressed]'));
  expect(options.filter((button) => button.classList.contains('active')).map((button) => button.id)).toEqual([selectedId]);
  expect(options.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.id)).toEqual([selectedId]);
  expect(Array.from(document.querySelectorAll('.mode-menu summary.active')).map((summary) => summary.parentElement?.id)).toEqual([`menu-${mode}`]);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const records = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  });
  vi.spyOn(GameAudio.prototype, 'unlock').mockImplementation(() => {});
  vi.spyOn(GameAudio.prototype, 'stop').mockImplementation(() => {});
  vi.spyOn(GameAudio.prototype, 'setMuted').mockImplementation(() => {});
});

afterEach(() => {
  for (const [type, listener, options] of listeners.splice(0)) document.removeEventListener(type, listener, options);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('real page toolbar', () => {
  it('starts the chosen standard game from either mode menu and selects only that mode and difficulty', () => {
    const { app } = makeToolbar();
    expectSelected('complex', 'beginner');
    const hyperMenu = element<HTMLDetailsElement>('menu-hyper');
    hyperMenu.open = true;
    element('btn-hyper-expert').click();
    expect(JSON.parse(app.debugState())).toMatchObject({ mode: 'hyper', w: 30, h: 16, mines: 99, started: false });
    expectSelected('hyper', 'expert');
    expect(hyperMenu.open).toBe(false);
    expect(document.activeElement).toBe(hyperMenu.querySelector('summary'));

    element('btn-intermediate').click();
    expect(JSON.parse(app.debugState())).toMatchObject({ mode: 'complex', w: 16, h: 16, mines: 40, started: false });
    expectSelected('complex', 'intermediate');
  });

  it('opens the other mode records through its menu without changing the current game', () => {
    saveScores({ best: [8, 24, 35] }, 'complex');
    saveScores({ best: [14, 28, 42] }, 'hyper');
    const { app, game } = makeToolbar();
    element('btn-hyper-intermediate').click();
    game.startAt(100, 1);
    const before = app.debugState();
    const mines = [...game.mine];
    const open = [...game.open];
    element('btn-scores').click();
    expect(showScores).toHaveBeenLastCalledWith({ best: [8, 24, 35] }, false, 'complex');
    expect(app.debugState()).toBe(before);
    expect([...game.mine]).toEqual(mines);
    expect([...game.open]).toEqual(open);
    expectSelected('hyper', 'intermediate');
  });

  it('cancels customization requested from the other mode menu without switching or restarting', async () => {
    const { app, game } = makeToolbar();
    element('btn-expert').click();
    game.startAt(100, 1);
    const before = app.debugState();
    vi.mocked(showCustomDialog).mockResolvedValue({ applied: false });
    const hyperMenu = element<HTMLDetailsElement>('menu-hyper');
    hyperMenu.open = true;
    element('btn-hyper-custom').click();
    await Promise.resolve();
    expect(showCustomDialog).toHaveBeenLastCalledWith(expect.objectContaining({ w: 30, h: 16, mines: 99 }), 'hyper');
    expect(app.debugState()).toBe(before);
    expectSelected('complex', 'expert');
    expect(hyperMenu.open).toBe(false);
    expect(document.activeElement).toBe(hyperMenu.querySelector('summary'));
  });

  it('toggles sound playback and exposes the matching pressed state and label', () => {
    makeToolbar();
    const button = element('btn-sound');
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);
    expect(button.textContent).toBe('音效：关');
    expect(loadSoundEnabled()).toBe(false);
    button.click();
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);
    expect(button.textContent).toBe('音效：开');
    expect(loadSoundEnabled()).toBe(true);
    expect(GameAudio.prototype.unlock).toHaveBeenCalledTimes(2);
  });

  it('restores a disabled sound preference before playing and keeps it across new games and modes', () => {
    saveSoundEnabled(false);
    const { app } = makeToolbar();
    const button = element('btn-sound');
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);
    expect(button.textContent).toBe('音效：关');
    app.newGame();
    element('btn-hyper-intermediate').click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(loadSoundEnabled()).toBe(false);
    button.click();
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(false);
    expect(loadSoundEnabled()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the sound switch usable when browser storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage reads denied'); },
      setItem: () => { throw new Error('Storage writes denied'); },
    });
    makeToolbar();
    const button = element('btn-sound');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(GameAudio.prototype.setMuted).toHaveBeenLastCalledWith(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens one menu at a time, closes on Escape with focus restored, and closes on an outside click', async () => {
    makeToolbar();
    const complex = element<HTMLDetailsElement>('menu-complex');
    const hyper = element<HTMLDetailsElement>('menu-hyper');
    complex.querySelector('summary')!.click();
    await vi.waitFor(() => expect(complex.open).toBe(true));
    hyper.querySelector('summary')!.click();
    await vi.waitFor(() => {
      expect(hyper.open).toBe(true);
      expect(complex.open).toBe(false);
    });
    element('btn-hyper-beginner').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(hyper.open).toBe(false);
    expect(document.activeElement).toBe(hyper.querySelector('summary'));
    complex.querySelector('summary')!.click();
    expect(complex.open).toBe(true);
    element('board').click();
    expect(complex.open).toBe(false);
  });
});
