import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio, SOUND_IDS } from '../src/app/audio';

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
}

class FakeContext {
  static instances: FakeContext[] = [];
  state = 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => bytes);
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });

  constructor() { FakeContext.instances.push(this); }
}

beforeEach(() => {
  FakeContext.instances = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('game audio', () => {
  it('unlocks once and loads all six WAVs relative to the site path', async () => {
    const audio = new GameAudio('/complexweeper/');
    audio.unlock();
    audio.unlock();
    expect(FakeContext.instances).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(
      SOUND_IDS.map((id) => `/complexweeper/assets/sounds/${id}.wav`),
    );
    audio.play('mine_3');
    await vi.waitFor(() => expect(FakeContext.instances[0].sources).toHaveLength(1));
    expect(FakeContext.instances[0].sources[0].start).toHaveBeenCalledOnce();
  });

  it('interrupts a tick when an ending sound is played', async () => {
    const audio = new GameAudio('/');
    audio.unlock();
    audio.play('tick');
    const context = FakeContext.instances[0];
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const tick = context.sources[0];
    audio.play('win');
    expect(tick.stop).toHaveBeenCalledOnce();
    expect(tick.disconnect).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    tick.onended?.();
    audio.stop();
    expect(context.sources[1].stop).toHaveBeenCalledOnce();
  });

  it('discards an old playback request when its WAV arrives after a newer sound', async () => {
    let resolveMine!: (response: { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }) => void;
    const pendingMine = new Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>((resolve) => { resolveMine = resolve; });
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('mine_1.wav')) return await pendingMine as Response;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) } as Response;
    });
    const audio = new GameAudio('/');
    audio.unlock();
    audio.play('mine_1');
    audio.play('win');
    const context = FakeContext.instances[0];
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    resolveMine({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(6));
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer).toEqual(new ArrayBuffer(2));
  });

  it('mutes current and pending audio and allows playback after unmuting', async () => {
    const audio = new GameAudio('/');
    audio.unlock();
    audio.play('tick');
    const context = FakeContext.instances[0];
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    audio.setMuted(true);
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    audio.play('win');
    expect(context.sources).toHaveLength(1);
    audio.setMuted(false);
    audio.play('mine_4');
    audio.setMuted(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.sources).toHaveLength(1);
    audio.setMuted(false);
    audio.play('mine_2');
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
  });

  it('keeps game actions usable without AudioContext or before a gesture', () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = new GameAudio('/');
    expect(() => { audio.unlock(); audio.play('win'); audio.setMuted(true); audio.stop(); }).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(FakeContext.instances).toHaveLength(0);
  });

  it('retries a failed WAV after the connection recovers and deduplicates simultaneous requests', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    const audio = new GameAudio('/');
    audio.unlock();
    audio.play('win');
    const context = FakeContext.instances[0];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context.sources).toHaveLength(0);

    vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
    audio.play('win');
    audio.play('win');
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('win.wav'))).toHaveLength(2);
    expect(context.sources[0].start).toHaveBeenCalledOnce();
    audio.play('win');
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('win.wav'))).toHaveLength(2);
  });

  it('contains network, decode, and resume failures without starting playback', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    const audio = new GameAudio('/');
    audio.unlock();
    audio.play('win');
    await Promise.resolve();
    await Promise.resolve();
    const offlineContext = FakeContext.instances[0];
    expect(offlineContext.sources).toHaveLength(0);

    vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
    const decodingAudio = new GameAudio('/');
    decodingAudio.unlock();
    const context = FakeContext.instances[1];
    context.decodeAudioData.mockRejectedValue(new Error('Invalid WAV'));
    context.state = 'suspended';
    context.resume.mockRejectedValue(new Error('Autoplay blocked'));
    decodingAudio.unlock();
    decodingAudio.play('mine_1');
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(6));
    expect(context.sources).toHaveLength(0);
  });
});

describe('upstream WAV assets', () => {
  it('ships valid complete RIFF WAV files for every sound', () => {
    for (const id of SOUND_IDS) {
      const wave = readFileSync(new URL(`../public/assets/sounds/${id}.wav`, import.meta.url));
      expect(wave.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wave.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wave.readUInt32LE(4) + 8).toBe(wave.length);
      expect(wave.length).toBeGreaterThan(1000);
    }
  });
});
