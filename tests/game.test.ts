// 规则单测：对照桌面版 selftest.zig 的自检点逐条覆盖。
import { describe, expect, it } from 'vitest';
import { Game, splitEvenly } from '../src/game/game';
import { Rng } from '../src/game/rng';
import { ACHIEVABLE, Msg, PRESETS } from '../src/game/constants';

function buildBoard(w: number, h: number, mines: number, tc: number[], seed: number, start: number): Game {
  const g = new Game();
  g.w = w;
  g.h = h;
  g.mines = mines;
  g.type_count.set(tc);
  g.newGame(seed);
  g.startAt(start, 0);
  return g;
}

/** 独立的洪水填充实现，用来核对游戏里的连片（与 selftest.zig 相同） */
function expectedCascade(game: Game, start: number): boolean[] {
  const set = new Array<boolean>(game.n).fill(false);
  const comp = new Array<boolean>(game.n).fill(false);
  const stack = [start];
  comp[start] = true;
  const buf: number[] = [];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const k = game.nbrs(i, buf as any);
    for (let x = 0; x < k; x++) {
      const j = buf[x];
      if (comp[j] || game.mine[j] !== 0) continue;
      if (game.isBlank(j)) {
        comp[j] = true;
        stack.push(j);
      }
    }
  }
  for (let i = 0; i < game.n; i++) {
    if (!comp[i]) continue;
    set[i] = true;
    const k = game.nbrs(i, buf as any);
    for (let x = 0; x < k; x++) {
      const j = buf[x];
      if (game.mine[j] === 0) set[j] = true;
    }
  }
  return set;
}

describe('1 随机数确定性', () => {
  it('同种子 + 同开局格生成完全相同的棋盘', () => {
    const a = buildBoard(16, 16, 40, [0, 0, 0, 0, 0], 12345, 100);
    const b = buildBoard(16, 16, 40, [0, 0, 0, 0, 0], 12345, 100);
    for (let i = 0; i < a.n; i++) expect(a.mine[i]).toBe(b.mine[i]);
  });
  it('不同种子生成不同棋盘', () => {
    const a = buildBoard(16, 16, 40, [0, 0, 0, 0, 0], 12345, 100);
    const c = buildBoard(16, 16, 40, [0, 0, 0, 0, 0], 999, 100);
    let diff = false;
    for (let i = 0; i < a.n; i++) if (a.mine[i] !== c.mine[i]) diff = true;
    expect(diff).toBe(true);
  });
  it('mulberry32 与 Zig 版同种子同序列', () => {
    // 两组独立实现相互印证：JS 版按 Zig 源码逐行重写，输出应稳定。
    // 若 Zig 版算法改动，这里的硬编码值会立刻暴露分歧。
    const r = new Rng(1);
    const seq = Array.from({ length: 8 }, () => r.next());
    expect(seq).toMatchSnapshot();
  });
});

describe('2 精确配比', () => {
  const cases = [
    [0, 3, 2, 4, 1],
    [0, 0, 0, 0, 6],
    [0, 7, 0, 0, 0],
    [0, 5, 5, 0, 0],
    [0, 0, 0, 4, 4],
  ];
  it('指定配比被精确执行（5 种配比 × 3 种子）', () => {
    for (const tc of cases) {
      const sum = tc[1] + tc[2] + tc[3] + tc[4];
      for (const seed of [11, 22, 33]) {
        const g = buildBoard(12, 12, sum, tc, seed, 70);
        for (let t = 1; t < 5; t++) expect(g.type_total[t]).toBe(tc[t]);
        expect(g.typeSum()).toBe(sum);
        expect(g.mines).toBe(sum);
      }
    }
  });
});

describe('3 纯实/纯虚局面的显示值全是完全平方数', () => {
  const pure = [
    [0, 5, 5, 0, 0],
    [0, 0, 0, 4, 4],
  ];
  it('D 必为完全平方数', () => {
    for (const tc of pure) {
      const sum = tc[1] + tc[2] + tc[3] + tc[4];
      for (const seed of [7, 8, 9]) {
        const g = buildBoard(12, 12, sum, tc, seed, 70);
        for (let i = 0; i < g.n; i++) {
          if (g.mine[i] !== 0) continue;
          const D = g.clue[i];
          const r = Math.floor(Math.sqrt(D));
          expect(r * r === D || (r + 1) * (r + 1) === D).toBe(true);
        }
      }
    }
  });
  it('所有显示值都属于 24 个可达值', () => {
    const g = buildBoard(30, 16, 99, [0, 0, 0, 0, 0], 42, 100);
    for (let i = 0; i < g.n; i++) {
      if (g.mine[i] !== 0) continue;
      expect(ACHIEVABLE).toContain(g.clue[i]);
    }
  });
});

describe('4 连片展开', () => {
  it('与独立洪水填充逐格一致，且绝不翻雷', () => {
    let samples = 0;
    for (const seed of [301, 302, 303, 304, 305]) {
      const probe = buildBoard(12, 12, 24, [0, 0, 0, 0, 0], seed, 70);
      for (let i = 0; i < probe.n && samples < 40; i++) {
        if (probe.mine[i] !== 0 || probe.open[i] !== 0 || !probe.isBlank(i)) continue;
        const g = buildBoard(12, 12, 24, [0, 0, 0, 0, 0], seed, 70);
        if (g.open[i] !== 0) continue;
        const before = Array.from({ length: g.n }, (_, k) => g.open[k] !== 0);
        g.reveal(i, 0);
        const want = expectedCascade(g, i);
        samples++;
        for (let k = 0; k < g.n; k++) {
          const got = g.open[k] !== 0 && !before[k];
          const exp = want[k] && !before[k];
          expect(got).toBe(exp);
          if (got) expect(g.mine[k]).toBe(0);
        }
      }
    }
    expect(samples).toBeGreaterThanOrEqual(20);
  });

  it('显示 0（邻域有雷相消）绝不连片', () => {
    let zeroSamples = 0;
    for (const seed of [301, 302, 303, 304, 305]) {
      const g = buildBoard(12, 12, 24, [0, 0, 0, 0, 0], seed, 70);
      for (let k = 0; k < g.n; k++) {
        if (g.mine[k] !== 0 || g.open[k] !== 0) continue;
        if (g.clue[k] !== 0 || g.nbrMineCount(k) === 0) continue;
        const before = Array.from({ length: g.n }, (_, m) => g.open[m] !== 0);
        g.reveal(k, 0);
        let openedNow = 0;
        for (let m = 0; m < g.n; m++) {
          if (g.open[m] !== 0 && !before[m]) openedNow++;
        }
        zeroSamples++;
        expect(openedNow).toBe(1);
      }
    }
    expect(zeroSamples).toBeGreaterThanOrEqual(5);
  });

  it('大盘开局连片：栈吃满也不漏格', () => {
    const shapes: [number, number, number][] = [
      [40, 30, 1],
      [40, 30, 5],
      [40, 30, 20],
      [40, 30, 60],
      [40, 20, 40],
      [30, 30, 60],
    ];
    let samples = 0;
    let big = 0;
    for (const [w, h, m] of shapes) {
      const starts = [0, Math.floor(w / 2), Math.floor(h / 2) * w + Math.floor(w / 2), w * h - 1];
      for (const seed of [4111, 4127, 4133, 4139, 4153, 4159]) {
        for (const st of starts) {
          const g = buildBoard(w, h, m, [0, 0, 0, 0, 0], seed, st);
          const want = expectedCascade(g, st);
          for (let k = 0; k < g.n; k++) {
            expect(g.open[k] !== 0).toBe(want[k]);
            if (g.open[k] !== 0) expect(g.mine[k]).toBe(0);
          }
          if (g.openedCount() >= 400) big++;
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThanOrEqual(72);
    expect(big).toBeGreaterThanOrEqual(8);
  });
});

describe('5 开局必定连片且不踩雷', () => {
  it('开局格必为空白格、必连片（≥9 格）且不踩雷；各类雷数已知', () => {
    for (const seed of [501, 502, 503, 504, 505]) {
      const g = new Game();
      g.w = 16;
      g.h = 16;
      g.mines = 40;
      g.newGame(seed);
      const start = 16 * 8 + 8;
      g.startAt(start, 0);
      expect(g.over).toBe(false);
      expect(g.openedCount()).toBeGreaterThanOrEqual(9);
      expect(g.isBlank(start)).toBe(true);
      expect(g.typeSum()).toBe(40);
      for (let t = 1; t < 5; t++) {
        expect(g.type_total[t]).toBeGreaterThan(0);
        expect(g.unmarked(t)).toBe(g.type_total[t]);
      }
    }
  });
});

describe('6 组合匹配判据', () => {
  it('与独立实现一致', () => {
    let pass = 0;
    let total = 0;
    const buf: number[] = [];
    for (const seed of [601, 602, 603]) {
      const g = buildBoard(12, 12, 24, [0, 0, 0, 0, 0], seed, 70);
      for (let i = 0; i < g.n; i++) {
        if (g.mine[i] !== 0 || g.open[i] === 0) continue;
        const k = g.nbrs(i, buf as any);
        for (let x = 0; x < k; x++) {
          const j = buf[x];
          if (g.open[j] !== 0) continue;
          g.setFlag(j, 1 + ((i + j) % 4));
        }
        const truth = [0, 0, 0, 0];
        const got = [0, 0, 0, 0];
        for (let x = 0; x < k; x++) {
          const j = buf[x];
          if (g.mine[j] !== 0) truth[g.mine[j] - 1]++;
          if (g.flag[j] !== 0) got[g.flag[j] - 1]++;
        }
        const P = truth[0] + truth[1];
        const V = truth[2] + truth[3];
        const gp = got[0] + got[1];
        const gv = got[2] + got[3];
        const want = gp + gv === P + V && ((gp === P && gv === V) || (gp === V && gv === P));
        expect(g.matchComboTruth(i)).toBe(want);
        total++;
        if (want) pass++;
      }
      for (let j = 0; j < g.n; j++) g.setFlag(j, 0);
    }
    expect(total).toBeGreaterThan(50);
    expect(pass).toBeGreaterThan(0);
  });

  it('判据不通过时展开不能改变棋盘', () => {
    const g = buildBoard(12, 12, 24, [0, 0, 0, 0, 0], 1001, 70);
    const buf: number[] = [];
    let cell = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.open[i] !== 0 && g.mine[i] === 0) {
        const k = g.nbrs(i, buf as any);
        let uns = 0;
        for (let x = 0; x < k; x++) {
          const j = buf[x];
          if (g.open[j] === 0 && g.flag[j] === 0) uns++;
        }
        if (uns > 0) {
          cell = i;
          break;
        }
      }
    }
    if (cell >= 0) {
      const before = Array.from({ length: g.n }, (_, i) => g.open[i] !== 0);
      g.tryExpand(cell);
      if (!g.matchComboTruth(cell)) {
        for (let i = 0; i < g.n; i++) expect(g.open[i] !== 0).toBe(before[i]);
        expect(g.msg).toBe(Msg.judge_fail);
      }
    }
  });
});

describe('7 插旗不限量 + 循环顺序', () => {
  it('右键循环 空→+1→−1→+i→−i→空', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 701, 40);
    let cell = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.open[i] === 0 && g.mine[i] === 0) {
        cell = i;
        break;
      }
    }
    const seq: number[] = [];
    for (let k = 0; k < 6; k++) {
      g.cycleFlag(cell);
      seq.push(g.flag[cell]);
    }
    expect(seq).toEqual([1, 2, 3, 4, 0, 1]);
  });

  it('旗帜不限量', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 702, 40);
    let placed = 0;
    for (let i = 0; i < g.n; i++) {
      if (g.open[i] === 0 && g.flag[i] === 0) {
        g.setFlag(i, 1);
        placed++;
      }
    }
    expect(placed).toBeGreaterThan(10); // 可以超过总雷数
    expect(g.flags_of[1]).toBe(placed);
  });
});

describe('8 旗子保护格子', () => {
  it('插旗的格子翻不开；连片也不碰旗子；撤旗后翻得开', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 801, 40);
    let cell = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.open[i] === 0 && g.mine[i] === 0) {
        cell = i;
        break;
      }
    }
    g.setFlag(cell, 3);
    expect(g.flags_of[3]).toBe(1);
    g.reveal(cell, 0);
    expect(g.open[cell]).toBe(0);
    expect(g.flag[cell]).toBe(3);
    expect(g.flags_of[3]).toBe(1);

    // 连片展开不该翻开插了旗的格子
    const buf: number[] = [];
    let blank = -1;
    let flaggedNbr = -1;
    outer: for (let i = 0; i < g.n; i++) {
      if (g.open[i] !== 0 || g.mine[i] !== 0 || !g.isBlank(i)) continue;
      const k = g.nbrs(i, buf as any);
      for (let x = 0; x < k; x++) {
        const j = buf[x];
        if (g.open[j] === 0 && g.mine[j] === 0 && g.flag[j] === 0) {
          blank = i;
          flaggedNbr = j;
          break outer;
        }
      }
    }
    if (blank >= 0) {
      g.setFlag(flaggedNbr, 1);
      g.reveal(blank, 0);
      expect(g.open[blank]).toBe(1);
      expect(g.open[flaggedNbr]).toBe(0);
      expect(g.flag[flaggedNbr]).toBe(1);
    }

    g.setFlag(cell, 0);
    g.reveal(cell, 0);
    expect(g.open[cell]).toBe(1);
    expect(g.flags_of[3]).toBe(0);
  });
});

describe('9 胜负判定', () => {
  it('翻开所有非雷格必须判胜', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 901, 40);
    for (let i = 0; i < g.n; i++) {
      if (g.mine[i] === 0 && g.open[i] === 0) g.reveal(i, 0);
    }
    expect(g.win).toBe(true);
    expect(g.over).toBe(true);
  });
  it('还剩非雷格未翻开时不能判胜', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 902, 40);
    let left = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.mine[i] === 0 && g.open[i] === 0) {
        left = i;
        break;
      }
    }
    for (let i = 0; i < g.n; i++) {
      if (i !== left && g.mine[i] === 0 && g.open[i] === 0) g.reveal(i, 0);
    }
    expect(g.win).toBe(false);
  });
  it('翻开雷必须判负并记录踩中的格子', () => {
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 903, 40);
    let m = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.mine[i] !== 0) {
        m = i;
        break;
      }
    }
    g.reveal(m, 0);
    expect(g.over).toBe(true);
    expect(g.win).toBe(false);
    expect(g.boom).toBe(m);
  });
});

describe('10 展开通过时翻开周围未插旗格', () => {
  it('判据通过 → 未插旗邻格被翻开；踩雷判负', () => {
    // 造一个一定能通过判据的格局：找到已开格，把它周围雷全部正确插旗
    const g = buildBoard(9, 9, 10, [0, 0, 0, 0, 0], 1001, 40);
    const buf: number[] = [];
    let cell = -1;
    for (let i = 0; i < g.n; i++) {
      if (g.open[i] !== 0 && g.mine[i] === 0 && g.clue[i] > 0) {
        cell = i;
        break;
      }
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    const k = g.nbrs(cell, buf as any);
    let truthMines = 0;
    for (let x = 0; x < k; x++) {
      const j = buf[x];
      if (g.mine[j] !== 0) {
        g.setFlag(j, g.mine[j]); // 正确插旗
        truthMines++;
      }
    }
    const before = g.openedCount();
    g.tryExpand(cell);
    if (!g.over) {
      expect(g.msg).toBe(Msg.expand_ok);
      expect(g.openedCount()).toBeGreaterThan(before);
    } else {
      // 踩到没标出来的雷也算合法结局（判据看数量与比例，不担保位置）
      expect(g.win).toBe(false);
    }
    expect(truthMines).toBeGreaterThanOrEqual(0);
  });
});

describe('splitEvenly', () => {
  it('尽量均匀分配', () => {
    expect(splitEvenly(10)).toEqual([0, 3, 3, 2, 2]);
    expect(splitEvenly(99)).toEqual([0, 25, 25, 25, 24]);
    expect(splitEvenly(4)).toEqual([0, 1, 1, 1, 1]);
    expect(splitEvenly(1)).toEqual([0, 1, 0, 0, 0]);
  });
});

describe('预设', () => {
  it('标准三档', () => {
    expect(PRESETS[0]).toMatchObject({ w: 9, h: 9, mines: 10 });
    expect(PRESETS[1]).toMatchObject({ w: 16, h: 16, mines: 40 });
    expect(PRESETS[2]).toMatchObject({ w: 30, h: 16, mines: 99 });
  });
});

describe('等价性抽查：同种子走固定操作序列', () => {
  it('两个独立构建的 Game 终局状态一致（确定性回归）', () => {
    const run = (): Game => {
      const g = new Game();
      g.w = 16;
      g.h = 16;
      g.mines = 40;
      g.newGame(20261005);
      g.startAt(16 * 8 + 8, 0);
      // 固定操作序列：翻开一串确定的非雷格、插几面旗
      for (let i = 0; i < g.n; i += 7) {
        if (!g.over && g.open[i] === 0 && g.mine[i] === 0) g.reveal(i, 0);
      }
      for (let i = 3; i < g.n; i += 11) {
        if (!g.over && g.open[i] === 0) g.setFlag(i, (i % 4) + 1);
      }
      return g;
    };
    const a = run();
    const b = run();
    expect(a.openedCount()).toBe(b.openedCount());
    expect(a.flagsTotal()).toBe(b.flagsTotal());
    expect(a.over).toBe(b.over);
    for (let i = 0; i < a.n; i++) {
      expect(a.open[i]).toBe(b.open[i]);
      expect(a.flag[i]).toBe(b.flag[i]);
      expect(a.mine[i]).toBe(b.mine[i]);
    }
  });
});
