// 布局与状态→贴图映射单测。
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import {
  cellAt,
  counterWidth,
  countersWidth,
  countersX,
  faceLeft,
  faceTop,
  FACE_SIZE,
  FACE_NUDGE,
  headerContentWidth,
  inFace,
  makeLayout,
  panelCells,
  panelValueDigits,
  timerWidth,
  timerX,
  valueDigits,
} from '../src/render/layout';
import { cellSpriteName, faceSpriteName, type PaintState } from '../src/render/renderer';

const st = (over: Partial<PaintState> = {}): PaintState => ({
  pressCell: -1,
  chordCell: -1,
  faceDown: false,
  boardHeld: false,
  faceFlashUntil: 0,
  now: 0,
  timerSeconds: 0,
  ...over,
});

describe('LED 格数', () => {
  it('正数按 base 格，超出才加格', () => {
    expect(valueDigits(4, 0)).toBe(4);
    expect(valueDigits(4, 9999)).toBe(4);
    expect(valueDigits(4, 10000)).toBe(5);
    expect(valueDigits(3, 999)).toBe(3);
    expect(valueDigits(3, 1000)).toBe(4);
  });
  it('负数占一格负号', () => {
    expect(valueDigits(4, -1)).toBe(4);
    expect(valueDigits(4, -999)).toBe(4);
    expect(valueDigits(4, -1000)).toBe(5);
    expect(valueDigits(3, -99)).toBe(3);
    expect(valueDigits(3, -100)).toBe(4);
    expect(valueDigits(3, -1000)).toBe(5);
    expect(panelCells(true, -1200)).toBe(6);
  });
  it('未开局按 base 画空格子', () => {
    expect(valueDigits(4, null)).toBe(4);
    expect(valueDigits(3, null)).toBe(3);
  });
  it('虚雷多一格 i 单位', () => {
    expect(panelCells(true, 5)).toBe(4); // 3 数字 + 1 个 i
    expect(panelCells(false, 5)).toBe(4); // 实雷常态四格
    expect(panelValueDigits(true, 5)).toBe(3);
  });
});

describe('布局', () => {
  const game = { w: 9, h: 9 };
  it('各缩放档尺寸按倍数放大', () => {
    for (const z of [1, 2, 3]) {
      const L = makeLayout(z, game);
      expect(L.cell).toBe(16 * z);
      expect(L.client_w).toBe(L.inner_w + 2 * (3 * z + 6 * z));
      const board_w = 9 * 16 * z + 2 * 3 * z;
      const hw = headerContentWidth(z);
      expect(L.inner_w).toBe(Math.max(board_w, hw));
    }
  });
  it('棋盘原点内居中', () => {
    const L = makeLayout(2, game);
    expect(L.board_x).toBe(L.frame + L.pad + Math.floor((L.inner_w - (9 * L.cell + 2 * L.box)) / 2) + L.box);
    expect(L.board_y).toBe(L.frame + L.pad + L.header_h + L.gap + L.box);
  });
  it('人脸不与计雷器/计时器重叠', () => {
    const L = makeLayout(2, game);
    const shown = (): number | null => null;
    const fx = faceLeft(L, shown);
    const fy = faceTop(L);
    const size = FACE_SIZE * 2;
    expect(fx).toBeGreaterThanOrEqual(L.header_x - FACE_NUDGE);
    expect(fx).toBeGreaterThanOrEqual(countersX(L) + countersWidth(L, shown));
    expect(fx + size).toBeLessThanOrEqual(timerX(L) - 6 * 2 + 1);
    expect(fy).toBeGreaterThanOrEqual(L.header_y - FACE_NUDGE);
    expect(fy + size).toBeLessThanOrEqual(L.header_y + L.header_h);
  });
  it('keeps the counters, face, and timer separate at every legal counter magnitude', () => {
    for (const z of [1, 2, 3]) {
      for (const h of [9, 16, 30]) {
        const L = makeLayout(z, { w: 9, h });
        for (const value of [null, -99, -100, -999, -1000, -1200, 1200]) {
          if (value !== null && Math.abs(value) > 9 * h) continue;
          const shown = () => value;
          const face = faceLeft(L, shown);
          expect(face).toBeGreaterThanOrEqual(countersX(L) + countersWidth(L, shown));
          expect(face + FACE_SIZE * z).toBeLessThan(timerX(L));
        }
        expect(makeLayout(z, { w: 9, h }).board_x).toBe(L.board_x);
      }
    }
  });
  it('计时器宽度 = 4 格 LED + 边框', () => {
    expect(timerWidth(2)).toBe(4 * 13 * 2 + 2 * 2);
  });
  it('计雷器宽度 = 图标 + 留白 + N 格 LED + 边框', () => {
    expect(counterWidth(2, 4)).toBe(16 * 2 + 2 * 2 + 4 * 13 * 2 + 2 * 2);
  });
});

describe('cellAt / inFace', () => {
  it('像素坐标 → 格子下标', () => {
    const g = { w: 9, h: 9 };
    const L = makeLayout(2, g);
    expect(cellAt(L, g, L.board_x, L.board_y)).toBe(0);
    expect(cellAt(L, g, L.board_x + L.cell - 1, L.board_y + L.cell - 1)).toBe(0);
    expect(cellAt(L, g, L.board_x + L.cell, L.board_y)).toBe(1);
    expect(cellAt(L, g, L.board_x, L.board_y + L.cell)).toBe(9);
    expect(cellAt(L, g, L.board_x - 1, L.board_y)).toBe(-1);
    expect(cellAt(L, g, L.board_x, L.board_y - 1)).toBe(-1);
    expect(cellAt(L, g, L.board_x + 9 * L.cell, L.board_y)).toBe(-1);
    expect(cellAt(L, g, L.board_x, L.board_y + 9 * L.cell)).toBe(-1);
  });
  it('人脸区域判定', () => {
    const g = { w: 9, h: 9 };
    const L = makeLayout(2, g);
    const shown = (): number | null => null;
    const fx = faceLeft(L, shown);
    const fy = faceTop(L);
    expect(inFace(L, fx + 1, fy + 1, shown)).toBe(true);
    expect(inFace(L, fx - 1, fy, shown)).toBe(false);
    expect(inFace(L, fx, fy - 1, shown)).toBe(false);
  });
});

describe('状态 → 贴图', () => {
  function gameWith(mineMap: Record<number, number>, openList: number[] = [], flagMap: Record<number, number> = {}): Game {
    const g = new Game();
    g.w = 4;
    g.h = 4;
    g.n = 16;
    g.mine.fill(0);
    g.open.fill(0);
    g.flag.fill(0);
    g.clue.fill(0);
    for (const [i, t] of Object.entries(mineMap)) g.mine[Number(i)] = t;
    for (const i of openList) g.open[i] = 1;
    for (const [i, t] of Object.entries(flagMap)) g.flag[Number(i)] = t;
    g.started = true;
    g.computeClues();
    return g;
  }

  it('未翻开无旗 → closed；插旗 → flag_t', () => {
    const g = gameWith({}, [], { 3: 2 });
    expect(cellSpriteName(g, st(), 0)).toBe('closed');
    expect(cellSpriteName(g, st(), 3)).toBe('flag_2');
  });

  it('翻开的空白 → blank；数字格 → num_D', () => {
    const g = gameWith({ 5: 1 }, [0, 1]);
    // cell 0 邻域无雷（雷在 5，即 row1 col1，与 0 相邻！）→ 重新摆：雷放角落 15
    const g2 = gameWith({ 15: 1 }, [0, 10]);
    expect(cellSpriteName(g2, st(), 0)).toBe('blank'); // 远离雷 → 空白
    expect(cellSpriteName(g2, st(), 10)).toBe('num_1'); // 邻域一颗正实雷 → D=1
    void g;
  });

  it('显示 0 但邻域有雷相消 → num_0，不是 blank', () => {
    // 格 5 周围放 +1 和 −1 一对 → D=0 且 nbrMineCount>0
    const g = gameWith({ 0: 1, 1: 2 }, [5]);
    g.clue[5] = 0;
    expect(cellSpriteName(g, st(), 5)).toBe('num_0');
  });

  it('按下预览画成 blank', () => {
    const g = gameWith({}, []);
    expect(cellSpriteName(g, st({ pressCell: 7 }), 7)).toBe('blank');
    expect(cellSpriteName(g, st({ pressCell: 7 }), 8)).toBe('closed');
    g.setFlag(7, 3);
    expect(cellSpriteName(g, st({ pressCell: 7 }), 7)).toBe('flag_3');
  });

  it('展开预览：待展开的邻格画成 blank（已开格与插旗格除外）', () => {
    // 4 列棋盘：格子 5 = (r1, c1)，邻域为 {0,1,2,4,6,8,9,10}
    const g = gameWith({}, [5], { 2: 1 });
    const s2 = st({ chordCell: 5 });
    expect(cellSpriteName(g, s2, 6)).toBe('blank'); // 未翻开未插旗邻格
    expect(cellSpriteName(g, s2, 9)).toBe('blank');
    expect(cellSpriteName(g, s2, 2)).toBe('flag_1'); // 插旗邻格不在展开预览里
    expect(cellSpriteName(g, s2, 3)).toBe('closed'); // 非邻格不受影响
    expect(cellSpriteName(g, s2, 7)).toBe('closed');
  });

  it('失败揭示：错旗 → wrong_t，未标雷 → mine_t，踩中 → boom_t', () => {
    const g = gameWith({ 1: 3, 3: 3, 5: 2 }, [], { 2: 4, 3: 3 });
    g.over = true;
    g.win = false;
    g.boom = 1;
    g.open[1] = 1;
    expect(cellSpriteName(g, st(), 1)).toBe('boom_3'); // 踩中的雷
    expect(cellSpriteName(g, st(), 2)).toBe('wrong_4'); // 标错的旗（该格无雷）
    expect(cellSpriteName(g, st(), 3)).toBe('flag_3'); // 标对的旗保持
    expect(cellSpriteName(g, st(), 5)).toBe('mine_2'); // 未标出的雷被揭示
  });

  it('胜利后不揭示雷', () => {
    const g = gameWith({ 1: 1 }, []);
    g.over = true;
    g.win = true;
    expect(cellSpriteName(g, st(), 1)).toBe('closed');
  });

  it('人脸状态', () => {
    const g = gameWith({});
    expect(faceSpriteName(g, st())).toBe('face_normal');
    expect(faceSpriteName(g, st({ faceDown: true }))).toBe('face_down');
    expect(faceSpriteName(g, st({ boardHeld: true }))).toBe('face_scan');
    expect(faceSpriteName(g, st({ now: 50, faceFlashUntil: 100 }))).toBe('face_scan');
    g.over = true;
    g.win = true;
    expect(faceSpriteName(g, st())).toBe('face_win');
    g.win = false;
    expect(faceSpriteName(g, st())).toBe('face_dead');
  });
});
