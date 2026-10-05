# 素材说明 / Asset Notice

本仓库的图像素材分两类，授权状态不同。转载、再发布或商用之前请读一遍这张表。

*The image assets in this repository fall into two categories with different licensing. Read this before redistributing, republishing, or using them commercially.*

素材位于 `public/assets/atlas.png`（256×87 的整图）+ `public/assets/atlas.json`（槽位表），由旧版 `素材/图集.png` / `素材/图集.json` 原样拷贝而来。下面用槽位名指认具体是哪几张。

*The assets live in `public/assets/atlas.png` (a 256×87 sheet) and `public/assets/atlas.json` (slot table), copied unchanged from the legacy `素材/图集.*`. Slots are referred to by name below.*

## 一、扫雷原始图像素材 —— 权利属于 Microsoft / Original Minesweeper graphics — © Microsoft

| 槽位 Slot | 内容 Content |
| --- | --- |
| `closed` / `blank` | 经典立体按钮：未翻开格、已翻开的空白格 / classic raised button: covered cell and revealed blank cell |
| `flag_1`…`flag_4` | 四种旗帜（正实 / 负实 / 正虚 / 负虚），由原版旗帜按类型做色相调整 / four flag variants, hue-shifted from the original flag |
| `mine_1`…`mine_4` | 四种雷，同上 / four mine variants, same treatment |
| `boom_1`…`boom_4` | 踩中的四种雷（同色雷 + 红底）/ the four detonated mines (mine on red background) |
| `wrong_1`…`wrong_4` | 标错的四种旗（同色雷 + 红叉）/ the four misplaced flags (mine with red cross) |

这些图形的版权归 Microsoft 所有，源自 Microsoft 扫雷（作者 Robert Donner、Curt Johnson），**不适用本仓库的 GPL-3.0 授权**。把它们留在这里，是为了让这个复刻版在视觉上与经典扫雷一致，只在"个人学习 / 兼容性展示"的意义上使用。

*These graphics are © Microsoft, from Microsoft Minesweeper (by Robert Donner and Curt Johnson), and are **not** covered by this repository's GPL-3.0 license. They are kept here so the remake visually matches the classic game, for personal study / compatibility demonstration only.*

**要商用或正式再发布**：请自行确认这部分素材的可用性，或者把它们换成你自己的图——改 `public/assets/atlas.png` 里对应的那几个矩形即可（槽位坐标见 `public/assets/atlas.json`）。

***For commercial or formal redistribution**: verify the usability of these assets yourself, or replace them with your own art — edit the corresponding rectangles in `public/assets/atlas.png` (slot coordinates are in `public/assets/atlas.json`).*

## 二、原创与新增素材 —— 青月晓，随本仓库按 GPL-3.0 发布 / Original additions — by 青月晓, GPL-3.0

| 槽位 Slot | 内容 Content |
| --- | --- |
| `num_0` … `num_64` | 24 个显示值的数字贴图，含 k√r 带系数的根式 / number sprites for the 24 display values, including the k√r radical forms |
| `led_0`…`led_9` / `led_minus` / `led_blank` / `led_i` | 计雷器与计时器的 LED 数字、负号、空格子、虚雷第四格的 i 单位 / LED digits, minus sign, blank slot, and the i unit for imaginary counters |
| `face_normal` / `face_down` / `face_scan` / `face_dead` / `face_win` | 五张脸（风格取自原版笑脸，重绘）/ five faces (redrawn in the style of the original smiley) |
| `icon` | 程序图标，32×32，带 alpha / app icon, 32×32 with alpha |

`public/assets/icon-32.png`、`icon-180.png`、`icon-192.png`、`icon-512.png` 由 `icon` 槽位经 `scripts/gen-icons.mjs` 导出。

*`public/assets/icon-*.png` are exported from the `icon` slot by `scripts/gen-icons.mjs`.*

## 三、音效 / Sound effects

本项目不包含音效素材。

*This project ships no sound effects.*

## 商标 / Trademarks

本程序是独立复刻作品，与 Microsoft 公司无隶属关系，也未获得其授权或背书。"Minesweeper"、"扫雷"及相关商标归各自权利人所有。

*This is an independent re-implementation, not affiliated with, endorsed, or sponsored by Microsoft. "Minesweeper" and related trademarks belong to their respective owners.*
