// 图集加载与槽位索引。图集文件由 素材/图集.png + 图集.json 原样拷贝而来。

export interface Slot {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Atlas {
  image!: HTMLImageElement;
  slots = new Map<string, Slot>();
  /** D 值 → num 贴图槽位（num_by_D 的 TS 版） */
  numByD = new Map<number, Slot>();

  async load(imageUrl: string, jsonUrl: string): Promise<void> {
    const [img, meta] = await Promise.all([
      loadImage(imageUrl),
      fetch(jsonUrl).then((r) => {
        if (!r.ok) throw new Error(`加载图集元数据失败: ${r.status}`);
        return r.json() as Promise<{ width: number; height: number; slots: Slot[] }>;
      }),
    ]);
    this.image = img;
    for (const s of meta.slots) {
      this.slots.set(s.name, s);
      const m = /^num_(\d+)$/.exec(s.name);
      if (m) this.numByD.set(Number(m[1]), s);
    }
  }

  slot(name: string): Slot {
    const s = this.slots.get(name);
    if (!s) throw new Error(`图集缺槽位: ${name}`);
    return s;
  }

  flagSprite(t: number): Slot {
    return this.slot(`flag_${t}`);
  }
  mineSprite(t: number): Slot {
    return this.slot(`mine_${t}`);
  }
  boomSprite(t: number): Slot {
    return this.slot(`boom_${t}`);
  }
  wrongSprite(t: number): Slot {
    return this.slot(`wrong_${t}`);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载图集图像失败: ${url}`));
    img.src = url;
  });
}
