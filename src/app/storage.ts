// 最高分纪录与声音偏好，使用 localStorage 持久化。
// 替代桌面版的注册表（HKCU\Software\Complexweeper）。接口隔离，未来可换后端实现。

import type { GameMode } from '../game/constants';

// 复数模式沿用原来的键，升级后保留已有纪录。
const KEYS: Record<GameMode, string> = {
  complex: 'complexweeper-web.scores.v1',
  hyper: 'complexweeper-web.scores.hyper.v1',
};
const SOUND_KEY = 'complexweeper-web.sound.v1';

/** 与上游一致：默认开，只在保存的值为 0 时关闭。 */
export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
  } catch {
    // 隐私模式等写不进去时，本次会话中的开关仍然生效。
  }
}

export interface Scores {
  /** 下标 0/1/2 = 初级/中级/高级；0 = 还没有纪录 */
  best: [number, number, number];
}

export function loadScores(mode: GameMode = 'complex'): Scores {
  try {
    const raw = localStorage.getItem(KEYS[mode]);
    if (!raw) return { best: [0, 0, 0] };
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.best) || v.best.length !== 3) return { best: [0, 0, 0] };
    return { best: [num(v.best[0]), num(v.best[1]), num(v.best[2])] };
  } catch {
    return { best: [0, 0, 0] };
  }
}

export function saveScores(s: Scores, mode: GameMode = 'complex'): Scores {
  const merged = mergeScores(s, loadScores(mode));
  try {
    localStorage.setItem(KEYS[mode], JSON.stringify(merged));
  } catch {
    // 隐私模式等写不进去就静默放弃（不影响玩）
  }
  return merged;
}

export function mergeScores(s: Scores, stored: Scores): Scores {
  const best = s.best.map((value, index) => {
    const incoming = num(value);
    const current = stored.best[index];
    if (incoming === 0) return current;
    if (current === 0) return incoming;
    return Math.min(incoming, current);
  }) as Scores['best'];
  return { best };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0;
}
