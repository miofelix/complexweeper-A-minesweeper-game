// 最高分纪录：三档标准难度各记最快秒数，localStorage 持久化。
// 替代桌面版的注册表（HKCU\Software\Complexweeper）。接口隔离，未来可换后端实现。

const KEY = 'complexweeper-web.scores.v1';

export interface Scores {
  /** 下标 0/1/2 = 初级/中级/高级；0 = 还没有纪录 */
  best: [number, number, number];
}

export function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { best: [0, 0, 0] };
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.best) || v.best.length !== 3) return { best: [0, 0, 0] };
    return { best: [num(v.best[0]), num(v.best[1]), num(v.best[2])] };
  } catch {
    return { best: [0, 0, 0] };
  }
}

export function saveScores(s: Scores): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 隐私模式等写不进去就静默放弃（不影响玩）
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
