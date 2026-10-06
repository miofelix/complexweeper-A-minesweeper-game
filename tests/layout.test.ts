// 布局与状态→贴图映射单测。
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { ACHIEVABLE, HYPER_ACHIEVABLE } from '../src/game/constants';
import { Atlas, numberSpriteName, type Slot } from '../src/render/atlas';
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
import { cellSpriteName, faceSpriteName, Renderer, type PaintState } from '../src/render/renderer';

const atlasMeta = JSON.parse(readFileSync(new URL('../public/assets/atlas.json', import.meta.url), 'utf8')) as {
  width: number;
  height: number;
  slots: Slot[];
};

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

  it('失败揭示：空格错旗 → wrongblank，正确旗 → right_t，未标雷 → mine_t，踩中 → boom_t', () => {
    const g = gameWith({ 1: 3, 3: 3, 5: 2 }, [], { 2: 4, 3: 3 });
    g.over = true;
    g.win = false;
    g.boom = 1;
    g.open[1] = 1;
    expect(cellSpriteName(g, st(), 1)).toBe('boom_3'); // 踩中的雷
    expect(cellSpriteName(g, st(), 2)).toBe('wrongblank'); // 标错的旗（该格无雷）
    expect(cellSpriteName(g, st(), 3)).toBe('right_3'); // 标对的雷
    expect(cellSpriteName(g, st(), 5)).toBe('mine_2'); // 未标出的雷被揭示
  });

  it('胜利后不揭示雷', () => {
    const g = gameWith({ 1: 1 }, []);
    g.over = true;
    g.win = true;
    expect(cellSpriteName(g, st(), 1)).toBe('closed');
  });

  it('两种模式的全部终局旗帜组合按真实雷型给出复盘反馈', () => {
    for (const mode of ['complex', 'hyper'] as const) {
      const families = mode === 'hyper'
        ? ['1', '2', '3', '4'].map((t, i) => `${i >= 2 ? 'h' : ''}right_${t}`)
        : ['right_1', 'right_2', 'right_3', 'right_4'];
      for (let truth = 0; truth <= 4; truth++) {
        for (let flag = 1; flag <= 4; flag++) {
          const g = gameWith(truth ? { 0: truth } : {}, [], { 0: flag });
          g.mode = mode;
          g.over = true;
          const correct = families[truth - 1];
          const wrong = correct?.replace('right_', 'wrong_');
          expect(cellSpriteName(g, st(), 0)).toBe(truth === 0 ? 'wrongblank' : flag === truth ? correct : wrong);
          g.win = true;
          const winTruth = truth || flag;
          const prefix = mode === 'hyper' && winTruth >= 3 ? 'h' : '';
          expect(cellSpriteName(g, st(), 0)).toBe(`${prefix}${truth !== 0 && flag === truth ? 'rightflag' : 'wrongflag'}_${winTruth}`);
        }
      }
    }
  });

  it('双曲数字使用有符号映射；相消的零保留数字贴图', () => {
    const g = gameWith({ 0: 1 }, [5]);
    g.mode = 'hyper';
    const shared = [0, 1, 4, 5, 8, 9, 16, 25, 32, 36, 49, 64];
    const extra = [3, 7, 12, 15, 21, 24, 35, 48];
    for (const D of shared) {
      g.clue[5] = D;
      expect(cellSpriteName(g, st(), 5)).toBe(`num_${D}`);
    }
    for (const D of extra) {
      g.clue[5] = D;
      expect(cellSpriteName(g, st(), 5)).toBe(`hnum_${D}`);
    }
    for (const D of [...shared.slice(1), ...extra]) {
      g.clue[5] = -D;
      expect(cellSpriteName(g, st(), 5)).toBe(`hnum_${D}_i`);
    }
    g.mine.fill(0);
    g.clue[5] = 0;
    expect(cellSpriteName(g, st(), 5)).toBe('blank');
  });

  it('双曲模式的旗、雷和爆炸使用 j 贴图，实雷共用复数素材', () => {
    for (let t = 1; t <= 4; t++) {
      const g = gameWith({ 0: t }, [], { 1: t });
      g.mode = 'hyper';
      const prefix = t >= 3 ? 'h' : '';
      expect(cellSpriteName(g, st(), 1)).toBe(`${prefix}flag_${t}`);
      g.over = true;
      expect(cellSpriteName(g, st(), 0)).toBe(`${prefix}mine_${t}`);
      g.open[0] = 1;
      g.boom = 0;
      expect(cellSpriteName(g, st(), 0)).toBe(`${prefix}boom_${t}`);
    }
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

describe('上游 1.1.3 图集', () => {
  it('图像尺寸、槽位边界与两种模式全部显示值一致', () => {
    const png = readFileSync(new URL('../public/assets/atlas.png', import.meta.url));
    expect(png.readUInt32BE(16)).toBe(atlasMeta.width);
    expect(png.readUInt32BE(20)).toBe(atlasMeta.height);
    expect(png[25]).toBe(6); // RGBA，保留上游透明通道
    const names = new Set(atlasMeta.slots.map((s) => s.name));
    expect(names.size).toBe(atlasMeta.slots.length);
    for (const s of atlasMeta.slots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(atlasMeta.width);
      expect(s.y + s.h).toBeLessThanOrEqual(atlasMeta.height);
    }
    for (const D of ACHIEVABLE) expect(names.has(numberSpriteName(D))).toBe(true);
    for (const D of HYPER_ACHIEVABLE) expect(names.has(numberSpriteName(D, 'hyper'))).toBe(true);
    for (const family of ['flag', 'mine', 'boom', 'wrong', 'right', 'rightflag', 'wrongflag']) {
      for (let t = 1; t <= 4; t++) {
        expect(names.has(`${family}_${t}`)).toBe(true);
        if (t >= 3) expect(names.has(`h${family}_${t}`)).toBe(true);
      }
    }
    expect(names.has('wrongblank')).toBe(true);
    expect(names.has('led_j')).toBe(true);
  });

  it('图集加载建立复数及双曲模式的完整数字映射', async () => {
    class LoadedImage {
      onload?: () => void;
      set src(_value: string) { Promise.resolve().then(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', LoadedImage);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => atlasMeta })));
    try {
      const atlas = new Atlas();
      await atlas.load('/atlas.png', '/atlas.json');
      expect(atlas.numByD.size).toBe(24);
      expect(atlas.hyperNumByD.size).toBe(39);
      expect(atlas.hyperNumByD.get(-3)?.name).toBe('hnum_3_i');
      expect(atlas.hyperNumByD.get(4)).toBe(atlas.numByD.get(4));
      expect(atlas.flagSprite(3, 'hyper').name).toBe('hflag_3');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('计雷器随模式切换单位和旗帜；开局前单位仍为空格', () => {
    const atlas = new Atlas();
    atlas.image = {} as HTMLImageElement;
    for (const slot of atlasMeta.slots) atlas.slots.set(slot.name, slot);
    const renderer = new Renderer(atlas);
    const g = new Game();
    const rendered: string[] = [];
    const ctx = {
      fillRect: vi.fn(),
      drawImage: (_image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) => {
        rendered.push(atlasMeta.slots.find((s) => s.x === sx && s.y === sy && s.w === sw && s.h === sh)!.name);
      },
    } as unknown as CanvasRenderingContext2D;
    for (const mode of ['complex', 'hyper'] as const) {
      g.mode = mode;
      g.started = true;
      rendered.length = 0;
      renderer.paint(ctx, g, makeLayout(1, g), st());
      expect(rendered.filter((name) => name === (mode === 'hyper' ? 'led_j' : 'led_i'))).toHaveLength(2);
      expect(rendered).toContain(mode === 'hyper' ? 'hflag_3' : 'flag_3');
      expect(rendered).toContain(mode === 'hyper' ? 'hflag_4' : 'flag_4');
      g.started = false;
      rendered.length = 0;
      renderer.paint(ctx, g, makeLayout(1, g), st());
      expect(rendered).not.toContain('led_i');
      expect(rendered).not.toContain('led_j');
    }
  });
});
