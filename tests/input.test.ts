// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { Msg } from '../src/game/constants';
import { InputController } from '../src/input/input';
import { makeLayout } from '../src/render/layout';

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
