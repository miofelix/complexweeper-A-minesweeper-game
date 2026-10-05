// mulberry32：与桌面版 game.zig 位级一致（同种子同棋盘）。
// 用 Math.imul 与 >>> 0 模拟 Zig 的 u32 环绕运算。

export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = (seed === 0 ? 1 : seed) >>> 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) 的整数 */
  below(n: number): number {
    if (n === 0) return 0;
    return Math.floor(this.next() * n);
  }
}
