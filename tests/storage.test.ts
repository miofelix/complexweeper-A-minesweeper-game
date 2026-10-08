import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScores, loadSoundEnabled, saveScores, saveSoundEnabled } from '../src/app/storage';

const KEY = 'complexweeper-web.scores.v1';
let records: Map<string, string>;

beforeEach(() => {
  records = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => records.set(key, value)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sound preference storage', () => {
  it('defaults to enabled and restores both saved choices', () => {
    expect(loadSoundEnabled()).toBe(true);
    saveSoundEnabled(false);
    expect(loadSoundEnabled()).toBe(false);
    saveSoundEnabled(true);
    expect(loadSoundEnabled()).toBe(true);
  });

  it('uses the default for invalid saved values without changing scores', () => {
    records.set(KEY, JSON.stringify({ best: [12, 24, 35] }));
    records.set('complexweeper-web.sound.v1', 'invalid');
    expect(loadSoundEnabled()).toBe(true);
    saveSoundEnabled(false);
    expect(loadScores().best).toEqual([12, 24, 35]);
  });

  it('defaults to enabled and permits toggling when storage access is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage reads denied'); },
      setItem: () => { throw new Error('Storage writes denied'); },
    });
    expect(loadSoundEnabled()).toBe(true);
    expect(() => saveSoundEnabled(false)).not.toThrow();
  });
});

describe('score storage', () => {
  it('loads whole numeric times and treats missing records as unset', () => {
    expect(loadScores().best).toEqual([0, 0, 0]);
    records.set(KEY, JSON.stringify({ best: [12, 0, 10000] }));
    expect(loadScores().best).toEqual([12, 0, 10000]);
  });

  it('retains legacy complex scores and merges hyper scores independently', () => {
    records.set(KEY, JSON.stringify({ best: [8, 24, 35] }));
    expect(loadScores('complex').best).toEqual([8, 24, 35]);
    expect(loadScores('hyper').best).toEqual([0, 0, 0]);
    const stale = loadScores('hyper');
    saveScores({ best: [12, 0, 30] }, 'hyper');
    stale.best = [18, 24, 0];
    expect(saveScores(stale, 'hyper').best).toEqual([12, 24, 30]);
    expect(loadScores('hyper').best).toEqual([12, 24, 30]);
    expect(loadScores().best).toEqual([8, 24, 35]);
  });

  it('ignores malformed records and invalid individual times', () => {
    records.set(KEY, '{');
    expect(loadScores().best).toEqual([0, 0, 0]);
    records.set(KEY, JSON.stringify({ best: [12, 24] }));
    expect(loadScores().best).toEqual([0, 0, 0]);
    records.set(KEY, JSON.stringify({ best: ['12', 1.5, true] }));
    expect(loadScores().best).toEqual([0, 0, 0]);
    records.set(KEY, JSON.stringify({ best: [12, -1, Number.MAX_SAFE_INTEGER + 1] }));
    expect(loadScores().best).toEqual([12, 0, 0]);
  });

  it('preserves faster times and other presets when stale tabs save', () => {
    const tabA = loadScores();
    const tabB = loadScores();
    tabA.best[0] = 12;
    tabA.best[2] = 35;
    expect(saveScores(tabA).best).toEqual([12, 0, 35]);

    tabB.best[0] = 18;
    tabB.best[1] = 24;
    expect(saveScores(tabB).best).toEqual([12, 24, 35]);
    expect(tabB.best).toEqual([18, 24, 0]);
    expect(loadScores().best).toEqual([12, 24, 35]);

    tabA.best[2] = 30;
    expect(saveScores(tabA).best).toEqual([12, 24, 30]);
    expect(loadScores().best).toEqual([12, 24, 30]);
  });

  it('keeps merged scores usable when persistence is denied', () => {
    records.set(KEY, JSON.stringify({ best: [12, 0, 35] }));
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Storage writes denied');
    });

    expect(saveScores({ best: [18, 24, 0] }).best).toEqual([12, 24, 35]);
    expect(loadScores().best).toEqual([12, 0, 35]);
  });

  it('keeps caller scores usable when storage cannot be accessed', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage reads denied'); },
      setItem: () => { throw new Error('Storage writes denied'); },
    });

    expect(loadScores().best).toEqual([0, 0, 0]);
    expect(saveScores({ best: [12, 24, 0] }).best).toEqual([12, 24, 0]);
  });
});
