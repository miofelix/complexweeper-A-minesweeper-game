/** 上游原始 WAV 音效；浏览器需要先在用户手势中解锁播放。 */
export const SOUND_IDS = ['mine_1', 'mine_2', 'mine_3', 'mine_4', 'win', 'tick'] as const;
export type SoundId = typeof SOUND_IDS[number];

export class GameAudio {
  private context: AudioContext | null = null;
  private ready: Promise<void> = Promise.resolve();
  private buffers = new Map<SoundId, Promise<AudioBuffer | null>>();
  private source: AudioBufferSourceNode | null = null;
  private latest = 0;
  private muted = false;

  constructor(private baseUrl: string = import.meta.env.BASE_URL) {}

  /** 在 pointerdown / keydown / 点击按钮等用户手势中调用；可重复调用。 */
  unlock(): void {
    try {
      if (!this.context) {
        const AudioCtor = globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        for (const id of SOUND_IDS) this.buffer(id);
      }
      if (this.context.state === 'suspended') {
        this.ready = Promise.resolve(this.context.resume()).catch(() => {});
      }
    } catch {
      // 不支持音频或浏览器暂时拒绝播放时，游戏操作照常继续。
    }
  }

  play(id: SoundId): void {
    this.stop();
    if (this.muted || !this.context) return;
    const request = this.latest;
    void this.start(id, request);
  }

  /** 静音立即打断当前音效，也取消尚未完成解码的播放请求。 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  /** 与上游 PlaySound 一样，同一时刻只播放最新的音效。 */
  stop(): void {
    this.latest++;
    const source = this.source;
    this.source = null;
    if (!source) return;
    try { source.stop(); } catch { /* 已结束的音效无需再次停止。 */ }
    try { source.disconnect(); } catch { /* 某些浏览器可能已断开。 */ }
  }

  private buffer(id: SoundId): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const context = this.context;
    const promise = (async () => {
      if (!context) return null;
      const response = await fetch(`${this.baseUrl}assets/sounds/${id}.wav`);
      if (!response.ok) return null;
      return await context.decodeAudioData(await response.arrayBuffer());
    })().catch(() => null).then((buffer) => {
      // 离线或浏览器解码失败后允许下次播放重试；成功的 WAV 仍只加载一次。
      if (!buffer && this.buffers.get(id) === promise) this.buffers.delete(id);
      return buffer;
    });
    this.buffers.set(id, promise);
    return promise;
  }

  private async start(id: SoundId, request: number): Promise<void> {
    try {
      const [buffer] = await Promise.all([this.buffer(id), this.ready]);
      const context = this.context;
      if (!buffer || !context || context.state !== 'running' || this.muted || request !== this.latest) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (this.source === source) this.source = null;
        try { source.disconnect(); } catch { /* 浏览器可能已断开。 */ }
      };
      this.source = source;
      source.start();
    } catch {
      // 网络、解码或播放失败只影响音效，不产生未处理的 Promise rejection。
    }
  }
}
