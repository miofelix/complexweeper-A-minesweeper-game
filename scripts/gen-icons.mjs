// 从 public/assets/atlas.png 的 icon 槽位（32×32）裁出 favicon 与 PWA 图标。
// 无第三方依赖：自带最小 PNG 解码/编码（图集是非交错 8 位 RGBA/RGB）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';


// ---------------------------------------------------------------- 最小 PNG 编解码
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
        throw new Error(`不支持的 PNG 格式: bitDepth=${bitDepth} colorType=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3;
  const stride = width * ch;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let src = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[src++];
    const line = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    unfilter(line, prev, ch, filter);
    for (let c = 0; c < width; c++) {
      const si = c * ch;
      const di = (row * width + c) * 4;
      out[di] = line[si];
      out[di + 1] = line[si + 1];
      out[di + 2] = line[si + 2];
      out[di + 3] = ch === 4 ? line[si + 3] : 255;
    }
    prev = line;
  }
  return { data: out, width, height };
}

function unfilter(line, prev, bpp, filter) {
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    if (filter === 1) line[i] = (line[i] + a) & 0xff;
    else if (filter === 2) line[i] = (line[i] + b) & 0xff;
    else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
    else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 0xff;
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(px, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0; // filter none
    px.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 执行
const atlas = JSON.parse(readFileSync('public/assets/atlas.json', 'utf8'));
const iconSlot = atlas.slots.find((s) => s.name === 'icon');
if (!iconSlot) throw new Error('图集缺 icon 槽位');

const png = decodePng(readFileSync('public/assets/atlas.png'));
const { x, y, w, h } = iconSlot;

function crop(px, pw, ph, cx, cy, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const src = ((cy + row) * pw + cx) * 4;
    px.copy(out, row * cw * 4, src, src + cw * 4);
  }
  return out;
}

function resizeNearest(px, pw, scale) {
  const nw = pw * scale;
  const out = Buffer.alloc(nw * nw * 4);
  for (let r = 0; r < nw; r++) {
    for (let c = 0; c < nw; c++) {
      const si = (Math.floor(r / scale) * pw + Math.floor(c / scale)) * 4;
      px.copy(out, (r * nw + c) * 4, si, si + 4);
    }
  }
  return { data: out, size: nw };
}

const icon32 = crop(png.data, png.width, png.height, x, y, w, h);
writeFileSync('public/assets/icon-32.png', encodePng(icon32, w, h));
for (const size of [180, 192, 512]) {
  const scale = size / w;
  const r = resizeNearest(icon32, w, scale);
  writeFileSync(`public/assets/icon-${size}.png`, encodePng(r.data, r.size, r.size));
}
console.log('icons: icon-32, icon-180, icon-192, icon-512 已生成');
