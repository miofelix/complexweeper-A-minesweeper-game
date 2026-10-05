// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { Msg } from '../src/game/constants';
import { InputController } from '../src/input/input';
import { faceLeft, faceTop, makeLayout } from '../src/render/layout';

function setup() {
  const game = new Game();
  game.newGame(1);
  const onAction = vi.fn();
  const onGameOver = vi.fn();
  const input = new InputController({
    game,
    getLayout: () => makeLayout(2, game),
    onAction,
    onGameOver,
    requestRender: vi.fn(),
  });
  const center = (cell: number): [number, number] => {
    const layout = makeLayout(2, game);
    return [
      layout.board_x + (cell % game.w + 0.5) * layout.cell,
      layout.board_y + (Math.floor(cell / game.w) + 0.5) * layout.cell,
    ];
  };
  return { game, input, onAction, onGameOver, center };
}

afterEach(() => vi.useRealTimers());

describe('first reveal', () => {
  it('settles an immediate win once without starting the timer or replacing the win message', () => {
    const { game, input, center, onAction, onGameOver } = setup();
    game.mines = 1;
    game.type_count.set([0, 1, 0, 0, 0]);
    input.onMouseDown({ button: 0 } as MouseEvent, ...center(0));
    input.onMouseUp({ button: 0 } as MouseEvent, ...center(0));
    expect(game.win).toBe(true);
    expect(game.msg).toBe(Msg.win);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith({ flashFace: false, startTimer: false });
  });
});

const touch = (pointerId = 1) => ({ pointerType: 'touch', pointerId } as PointerEvent);

describe('touch gestures', () => {
  it('cycles one flag per long press and does not reveal on release', () => {
    vi.useFakeTimers();
    const { game, input, center } = setup();
    input.onPointerDown(touch(), ...center(0));
    expect(input.boardHeld()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(game.flag[0]).toBe(1);
    input.onPointerUp(touch(), ...center(0));
    expect(game.flag[0]).toBe(1);
    expect(game.started).toBe(false);
    expect(input.hasActiveTouch).toBe(false);
  });

  it('panning clears the preview and cannot reveal or flag when the finger returns', () => {
    vi.useFakeTimers();
    const { game, input, center } = setup();
    const [x, y] = center(0);
    input.onPointerDown(touch(), x, y);
    input.onPointerMove(touch(), x + 40, y);
    expect(input.pressCell).toBe(-1);
    expect(input.boardHeld()).toBe(false);
    input.onPointerMove(touch(), x, y);
    vi.advanceTimersByTime(600);
    input.onPointerUp(touch(), x, y);
    expect(game.started).toBe(false);
    expect(game.flagsTotal()).toBe(0);
  });

  it.each(['cancel', 'reset', 'multitouch'])('%s aborts a pending long press', (action) => {
    vi.useFakeTimers();
    const { game, input, center } = setup();
    input.onPointerDown(touch(), ...center(0));
    if (action === 'cancel') input.onPointerCancel(touch());
    if (action === 'reset') input.resetGesture();
    if (action === 'multitouch') input.onPointerDown(touch(2), ...center(1));
    vi.advanceTimersByTime(600);
    input.onPointerUp(touch(), ...center(0));
    expect(game.flagsTotal()).toBe(0);
    expect(game.started).toBe(false);
    expect(input.pressCell).toBe(-1);
    expect(input.hasActiveTouch).toBe(false);
  });

  it('a cancelled touch cannot carry double-tap history into the next gesture', () => {
    const { game, input, center } = setup();
    game.startAt(40, 0);
    const cell = 40;
    input.onPointerDown(touch(), ...center(cell));
    input.onPointerUp(touch(), ...center(cell));
    input.onPointerDown(touch(), ...center(cell));
    expect(input.chordCell).toBe(cell);
    input.onPointerCancel(touch());
    input.onPointerDown(touch(), ...center(cell));
    expect(input.chordCell).toBe(-1);
    input.onPointerCancel(touch());
  });

  it('moving a face press cancels restart even if release returns to the face', () => {
    const { game, input, onAction } = setup();
    const layout = makeLayout(2, game);
    const x = faceLeft(layout, () => null) + 10;
    const y = faceTop(layout) + 10;
    input.onPointerDown(touch(), x, y);
    input.onPointerMove(touch(), x + 40, y);
    input.onPointerUp(touch(), x, y);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('holding the face does not disable restart with the cell long-press timeout', () => {
    vi.useFakeTimers();
    const { game, input, onAction } = setup();
    const layout = makeLayout(2, game);
    const x = faceLeft(layout, () => null) + 10;
    const y = faceTop(layout) + 10;
    input.onPointerDown(touch(), x, y);
    vi.advanceTimersByTime(600);
    input.onPointerUp(touch(), x, y);
    expect(onAction).toHaveBeenLastCalledWith({ flashFace: false, startTimer: false, faceRestart: true });
  });

  it('flag mode taps cycle without starting the game', () => {
    const { game, input, center } = setup();
    input.toggleFlagMode();
    for (let i = 1; i <= 5; i++) {
      input.onPointerDown(touch(), ...center(0));
      input.onPointerUp(touch(), ...center(0));
      expect(game.flag[0]).toBe(i % 5);
      expect(game.started).toBe(false);
    }
  });
});

describe('mouse gestures', () => {
  it.each([true, false])('does not reveal a different cell after a chord releases right first (inside: %s)', (inside) => {
    const { game, input, center } = setup();
    game.startAt(40, 0);
    const covered = Array.from({ length: game.n }, (_, i) => i).find(i => !game.open[i])!;
    input.onMouseDown({ button: 0 } as MouseEvent, ...center(40));
    input.onMouseDown({ button: 2 } as MouseEvent, ...center(40));
    if (!inside) input.onMouseMove(-10, -10);
    input.onMouseUp({ button: 2 } as MouseEvent, ...(inside ? center(40) : [-10, -10] as [number, number]));
    input.onMouseMove(...center(covered));
    expect(input.pressCell).toBe(-1);
    input.onMouseUp({ button: 0 } as MouseEvent, ...center(covered));
    expect(game.open[covered]).toBe(0);

    input.onMouseDown({ button: 0 } as MouseEvent, ...center(covered));
    expect(input.pressCell).toBe(covered);
    input.resetGesture();
  });
  it('keeps a flagged cell visible during a left press', () => {
    const { game, input, center } = setup();
    game.setFlag(0, 3);
    input.onMouseDown({ button: 0 } as MouseEvent, ...center(0));
    expect(input.pressCell).toBe(-1);
    input.onMouseUp({ button: 0 } as MouseEvent, ...center(0));
    expect(game.flag[0]).toBe(3);
    expect(game.started).toBe(false);
  });

  it('resumes the held-cell preview after leaving and reentering the board', () => {
    const { game, input, center } = setup();
    input.onMouseDown({ button: 0 } as MouseEvent, ...center(0));
    input.onMouseMove(-10, -10);
    expect(input.pressCell).toBe(-1);
    input.onMouseMove(...center(1));
    expect(input.pressCell).toBe(1);
    input.onMouseUp({ button: 0 } as MouseEvent, ...center(1));
    expect(game.started).toBe(true);
    expect(game.start_cell).toBe(1);
  });
});
