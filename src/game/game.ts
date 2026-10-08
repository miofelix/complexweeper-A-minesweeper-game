// 复扫雷 · 规则与状态。这一层不碰任何 DOM，方便单独测试。
// 与桌面版 game.zig 逐条对应，行为完全等价（同种子同棋盘）。

import { MAX_CELLS, TYPES, Msg } from './constants';
import type { GameMode } from './constants';
import { Rng } from './rng';

export class Game {
  w = 9;
  h = 9;
  n = 81;
  /** 玩法和判据是设置，newGame 保留它们。 */
  mode: GameMode = 'complex';
  /** 闵可夫斯基模式的宽松判据：仅要求显示值相同，旗数仍须相等。 */
  judge_loose = false;
  mine = new Uint8Array(MAX_CELLS);
  /** 圆复数模式 a²+b²；闵可夫斯基模式 a²−b²。是否为雷须读 mine，不能用 −1 判断。 */
  clue = new Int16Array(MAX_CELLS).fill(-1);
  open = new Uint8Array(MAX_CELLS);
  flag = new Uint8Array(MAX_CELLS);
  seed = 1;
  rng = new Rng(1);
  mines = 10;
  /** 各类雷的总数（下标 1..4），开局公开 */
  type_total = new Uint16Array(5);
  /** 当前插了各类旗几面 */
  flags_of = new Uint16Array(5);
  /** 自定义配比（下标 1..4）；全 0 表示"类型随机撒" */
  type_count = new Uint16Array(5);
  started = false;
  over = false;
  win = false;
  boom = -1;
  start_cell = -1;
  elapsed_ms = 0;
  t0 = 0;
  moves = 0;
  /** 上一次操作的反馈（文案在界面层） */
  msg: Msg = Msg.none;
  /** 附加数字（例如展开格数），0 表示无 */
  msg_arg = 0;

  constructor() {
    this.newGame(1);
  }

  cellCount(): number {
    return this.n;
  }

  inb(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.h && c < this.w;
  }

  /** 8 邻域，写到 buf 里，返回个数 */
  nbrs(cell: number, buf: number[]): number {
    const w = this.w;
    const r = Math.floor(cell / this.w);
    const c = cell % this.w;
    let k = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= this.h || cc >= this.w) continue;
        buf[k] = rr * w + cc;
        k++;
      }
    }
    return k;
  }

  nbrMineCount(cell: number): number {
    const buf: number[] = [];
    const k = this.nbrs(cell, buf as any);
    let n = 0;
    for (let i = 0; i < k; i++) {
      if (this.mine[buf[i]] !== 0) n++;
    }
    return n;
  }

  /** 邻域里的旗帜数。 */
  nbrFlagCount(cell: number): number {
    const buf: number[] = [];
    const k = this.nbrs(cell, buf);
    let n = 0;
    for (let i = 0; i < k; i++) {
      if (this.flag[buf[i]] !== 0) n++;
    }
    return n;
  }

  /** 邻域的净实部和净单位分量；use_flag 为真时统计旗帜。 */
  sumsOf(cell: number, use_flag: boolean): [number, number] {
    const source = use_flag ? this.flag : this.mine;
    const buf: number[] = [];
    const k = this.nbrs(cell, buf);
    let a = 0;
    let b = 0;
    for (let i = 0; i < k; i++) {
      const t = source[buf[i]];
      if (t === 0) continue;
      a += TYPES[t - 1][0];
      b += TYPES[t - 1][1];
    }
    return [a, b];
  }

  /** 空白格：邻域一颗雷都没有。只有它会连片展开 */
  isBlank(cell: number): boolean {
    return this.mine[cell] === 0 && this.nbrMineCount(cell) === 0;
  }

  flagsTotal(): number {
    let s = 0;
    for (let t = 1; t < 5; t++) s += this.flags_of[t];
    return s;
  }

  /** 该类雷还有几颗没标（可以是负数） */
  unmarked(t: number): number {
    return this.type_total[t] - this.flags_of[t];
  }

  setMsg(m: Msg): void {
    this.msg = m;
    this.msg_arg = 0;
  }

  // ---------------------------------------------------------------- 生成
  setSeed(s: number): void {
    this.seed = s === 0 ? 1 : s >>> 0;
    this.rng = new Rng(this.seed);
  }

  /** 新开一局（未开局状态，棋盘等第一次点击时再生成） */
  newGame(seed: number): void {
    this.n = this.w * this.h;
    for (let i = 0; i < this.n; i++) {
      this.mine[i] = 0;
      this.clue[i] = -1;
      this.open[i] = 0;
      this.flag[i] = 0;
    }
    this.started = false;
    this.over = false;
    this.win = false;
    this.boom = -1;
    this.start_cell = -1;
    this.elapsed_ms = 0;
    this.t0 = 0;
    this.moves = 0;
    this.type_total.fill(0);
    this.flags_of.fill(0);
    this.setSeed(seed);
    this.setMsg(Msg.none);
  }

  /** 布雷 + 算显示值 + 从开局格连片。safe = 开局格及其（界内）8 邻居。 */
  genBoard(start_cell: number): void {
    const N = this.n;
    for (let i = 0; i < N; i++) {
      this.mine[i] = 0;
      this.clue[i] = -1;
      this.open[i] = 0;
      // 注意：这里**不动 flag[]**。开局前插的旗要活过第一次左键。
    }
    const is_safe = new Array<boolean>(MAX_CELLS).fill(false);
    is_safe[start_cell] = true;
    const nbuf: number[] = [];
    const nk = this.nbrs(start_cell, nbuf as any);
    for (let i = 0; i < nk; i++) is_safe[nbuf[i]] = true;

    const pool: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!is_safe[i]) pool.push(i);
    }
    // 洗位置
    for (let i = pool.length - 1; i > 0; i--) {
      const j = this.rng.below(i + 1);
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    let want = 0;
    for (let t = 1; t < 5; t++) want += this.type_count[t];
    const count = Math.min(want > 0 ? want : this.mines, pool.length);

    if (want > 0) {
      // 精确配比：先铺类型序列，再洗一遍
      const list: number[] = [];
      for (let t = 1; t < 5; t++) {
        for (let k = 0; k < this.type_count[t]; k++) list.push(t);
      }
      let ln = Math.min(list.length, count);
      for (let i = ln - 1; i > 0; i--) {
        const j = this.rng.below(i + 1);
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      for (let k = 0; k < ln; k++) this.mine[pool[k]] = list[k];
    } else {
      for (let k = 0; k < count; k++) this.mine[pool[k]] = 1 + this.rng.below(4);
    }
    this.mines = count;
    this.computeClues();
    this.countTypes();
    this.cascadeOpen([start_cell]);
  }

  computeClues(): void {
    for (let i = 0; i < this.n; i++) {
      if (this.mine[i] !== 0) {
        this.clue[i] = -1;
        continue;
      }
      const [a, b] = this.sumsOf(i, false);
      this.clue[i] = this.mode === 'hyper' ? a * a - b * b : a * a + b * b;
    }
  }

  countTypes(): void {
    this.type_total.fill(0);
    for (let i = 0; i < this.n; i++) {
      if (this.mine[i] !== 0) this.type_total[this.mine[i]]++;
    }
  }

  /**
   * 连片翻开：只在空白格上继续扩散。返回新翻开的格数。
   * 压栈时查重，保证 40×30 大空白区也不漏格（原 Zig 版踩过的坑）。
   */
  cascadeOpen(seeds: number[]): number {
    const stack: number[] = [];
    const queued = new Array<boolean>(MAX_CELLS).fill(false);
    for (const s of seeds) {
      if (!queued[s]) {
        queued[s] = true;
        stack.push(s);
      }
    }
    let opened = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      // 连片也不碰插了旗的格子（旗子保护它，得玩家自己撤旗）
      if (this.open[i] !== 0 || this.mine[i] !== 0 || this.flag[i] !== 0) continue;
      this.open[i] = 1;
      opened++;
      if (this.isBlank(i)) {
        const buf: number[] = [];
        const k = this.nbrs(i, buf as any);
        for (let x = 0; x < k; x++) {
          const j = buf[x];
          if (
            !queued[j] &&
            this.open[j] === 0 &&
            this.mine[j] === 0 &&
            this.flag[j] === 0
          ) {
            queued[j] = true;
            stack.push(j);
          }
        }
      }
    }
    return opened;
  }

  // ---------------------------------------------------------------- 操作
  startAt(cell: number, now_ms: number): void {
    this.setSeed(this.seed);
    this.genBoard(cell);
    this.start_cell = cell;
    this.started = true;
    this.over = false;
    this.win = false;
    this.elapsed_ms = 0;
    this.t0 = now_ms;
    this.moves = 1;
    this.setMsg(Msg.none);
    this.checkWin();
  }

  /** 插/改/清旗。旗帜不限量，永远成功 */
  setFlag(cell: number, t: number): boolean {
    if (t > 4) return false;
    const old = this.flag[cell];
    if (old === t) return true;
    if (old !== 0) this.flags_of[old]--;
    this.flag[cell] = t;
    if (t !== 0) this.flags_of[t]++;
    return true;
  }

  /** 右键循环：空 → +1 → −1 → +i → −i → 空 */
  cycleFlag(cell: number): boolean {
    if (this.over || this.open[cell] !== 0) return false;
    const next = (this.flag[cell] + 1) % 5;
    this.setFlag(cell, next);
    this.moves++;
    return true;
  }

  /** 翻开一格。插了旗的格子翻不开（旗子保护它） */
  reveal(cell: number, _now_ms: number): void {
    if (this.over || this.open[cell] !== 0 || this.flag[cell] !== 0) return;
    if (this.mine[cell] !== 0) {
      this.open[cell] = 1;
      this.lose(cell);
      return;
    }
    this.open[cell] = 1;
    if (this.isBlank(cell)) {
      const buf: number[] = [];
      const k = this.nbrs(cell, buf as any);
      this.cascadeOpen(buf.slice(0, k));
    }
    this.moves++;
    this.checkWin();
  }

  /**
   * 旗数必须等于邻域雷数。圆复数模式允许实/虚总数交换；
   * 闵可夫斯基模式要求类空、类时净分量的绝对值分别相等，宽松判据仅要求 signed D 相等。
   */
  matchComboTruth(cell: number): boolean {
    if (this.nbrMineCount(cell) !== this.nbrFlagCount(cell)) return false;
    if (this.mode === 'hyper') {
      const [a, b] = this.sumsOf(cell, false);
      const [fa, fb] = this.sumsOf(cell, true);
      if (this.judge_loose) return a * a - b * b === fa * fa - fb * fb;
      return Math.abs(fa) === Math.abs(a) && Math.abs(fb) === Math.abs(b);
    }
    const truth = [0, 0, 0, 0];
    const got = [0, 0, 0, 0];
    const buf: number[] = [];
    const k = this.nbrs(cell, buf as any);
    for (let x = 0; x < k; x++) {
      const j = buf[x];
      if (this.mine[j] !== 0) truth[this.mine[j] - 1]++;
      if (this.flag[j] !== 0) got[this.flag[j] - 1]++;
    }
    const P = truth[0] + truth[1];
    const V = truth[2] + truth[3];
    const gp = got[0] + got[1];
    const gv = got[2] + got[3];
    return gp + gv === P + V && ((gp === P && gv === V) || (gp === V && gv === P));
  }

  /** 双击展开：判据通过就翻开周围未插旗的格（可能踩雷） */
  tryExpand(cell: number): void {
    if (this.over || this.open[cell] === 0 || this.mine[cell] !== 0) return;
    const buf: number[] = [];
    const k = this.nbrs(cell, buf as any);
    const uns: number[] = [];
    for (let x = 0; x < k; x++) {
      const j = buf[x];
      if (this.open[j] === 0 && this.flag[j] === 0) uns.push(j);
    }
    if (uns.length === 0) return;
    if (!this.matchComboTruth(cell)) {
      this.setMsg(Msg.judge_fail);
      return;
    }
    let boom = -1;
    for (const j of uns) {
      if (this.mine[j] !== 0) {
        boom = j;
        break;
      }
    }
    if (boom >= 0) {
      this.open[boom] = 1;
      this.lose(boom);
      return;
    }
    this.cascadeOpen(uns);
    this.moves++;
    this.setMsg(Msg.expand_ok);
    this.msg_arg = uns.length;
    this.checkWin();
  }

  checkWin(): void {
    for (let i = 0; i < this.n; i++) {
      if (this.mine[i] === 0 && this.open[i] === 0) return;
    }
    this.over = true;
    this.win = true;
    this.setMsg(Msg.win);
  }

  lose(cell: number): void {
    this.over = true;
    this.win = false;
    this.boom = cell;
    this.setMsg(Msg.lose);
  }

  openedCount(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.open[i] !== 0) k++;
    }
    return k;
  }

  safeCount(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.mine[i] === 0) k++;
    }
    return k;
  }

  correctFlags(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.mine[i] !== 0 && this.flag[i] === this.mine[i]) k++;
    }
    return k;
  }

  /** 精确定义下的合法配比（各类雷数之和 = 总雷数） */
  typeSum(): number {
    let s = 0;
    for (let t = 1; t < 5; t++) s += this.type_total[t];
    return s;
  }
}

/** 把总数尽量均匀分给四种雷（自定义对话框的预填值） */
export function splitEvenly(total: number): number[] {
  const out = [0, 0, 0, 0, 0];
  const base = Math.floor(total / 4);
  let rest = total - base * 4;
  for (let t = 1; t < 5; t++) {
    out[t] = base;
    if (rest > 0) {
      out[t] += 1;
      rest -= 1;
    }
  }
  return out;
}
