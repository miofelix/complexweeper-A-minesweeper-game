// 从上游内嵌容器原样提取六段 WAV：node scripts/extract-sounds.mjs [git-ref]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] ?? 'upstream/main';
if (process.argv.length > 3 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) {
  throw new Error('用法：node scripts/extract-sounds.mjs [git-ref]');
}
const bin = execFileSync('git', ['show', `${ref}:正式版/src/sounds.bin`], { cwd: root, maxBuffer: 1024 * 1024 });
const ids = ['mine_1', 'mine_2', 'mine_3', 'mine_4', 'win', 'tick'];
if (bin.length < 12 || bin.toString('ascii', 0, 4) !== 'CSSN' || bin.readUInt16LE(4) !== 1 || bin.readUInt16LE(6) !== ids.length) {
  throw new Error('不支持的上游 sounds.bin 容器');
}
const dataOffset = bin.readUInt32LE(8);
if (dataOffset < 12 + ids.length * 20 || dataOffset > bin.length) throw new Error('音效目录超出容器范围');
const waves = ids.map((id, i) => {
  const entry = 12 + i * 20;
  const start = dataOffset + bin.readUInt32LE(entry);
  const length = bin.readUInt32LE(entry + 4);
  if (length < 44 || start + length > bin.length) throw new Error(`${id} 超出容器范围`);
  const wave = bin.subarray(start, start + length);
  if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${id} 不是 WAV`);
  }
  return { id, wave };
});
const output = resolve(root, 'public/assets/sounds');
mkdirSync(output, { recursive: true });
for (const { id, wave } of waves) writeFileSync(resolve(output, `${id}.wav`), wave);
console.log(`从 ${ref} 原样提取 ${waves.length} 段音效到 public/assets/sounds/`);
