import { describe, it, expect } from 'vitest';
import { InputController } from '../src/input/input';
import { Game } from '../src/game/game';
import { makeLayout } from '../src/render/layout';

function mk() {
  const game = new Game();
  game.w = 9; game.h = 9; game.mines = 10;
  game.newGame(12345);
  const input = new InputController({
    game,
    getLayout: () => makeLayout(1, game),
    onAction: () => {},
    onGameOver: () => {},
    requestRender: () => {},
  });
  return { game, input };
}
// 让格子 (0,0) 的像素坐标：布局原点在 border，cellAt 需要实际像素。
// 直接用 cellAt 反推太绕，改为调用 onMouseDown 时给出一个落在某 covered 格内的坐标。
// makeLayout(1, game)：border=?, cell=16。取棋盘内一个安全点。
function cellCenterPx(game: Game, col: number, row: number): [number, number] {
  const L = makeLayout(1, game);
  return [L.board_x + col * 16 + 8, L.board_y + row * 16 + 8];
}

describe('flag mode', () => {
  it('survives newGame after game over', () => {
    const { game, input } = mk();
    (input as any).toggleFlagMode();
    game.startAt(0, 0);
    (game as any).over = true;
    input.resetGesture();
    game.newGame(999);
    expect(input.flagMode).toBe(true);
  });

  it('desktop mouse left-click cycles flag when flag mode on', () => {
    const { game, input } = mk();
    game.startAt(40, 0); // start somewhere
    (input as any).toggleFlagMode();
    const [x, y] = cellCenterPx(game, 0, 0);
    const before = game.flag[0];
    input.onMouseDown({ button: 0 } as MouseEvent, x, y);
    expect(game.flag[0]).toBe((before + 1) % 5);
  });

  it('hasActiveTouch distinguishes compat mouse events', () => {
    const { input } = mk();
    expect(input.hasActiveTouch).toBe(false);
    (input as any).touch_id = 1;
    expect(input.hasActiveTouch).toBe(true);
    (input as any).touch_id = null;
  });
});
