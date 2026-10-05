# 复扫雷 Complexweeper

> [English README](README.en.md)

扫雷，但雷是复数：四种雷分别是正实雷、负实雷、正虚雷、负虚雷；格子上的数字是它周围所有雷之和的模长。

翻开所有非雷格子就胜利。

**纯静态 Web 应用**：Vite + TypeScript + Canvas 2D，无运行时依赖、无后端，构建产物可直接托管到任意静态平台，支持 PWA 离线游玩。

## 出处与致谢

本仓库是 [Yueqing-Chen/complexweeper-A-minesweeper-game](https://github.com/Yueqing-Chen/complexweeper-A-minesweeper-game) 的修改版本（fork）：原作为青月晓开发的 Zig + Win32 桌面程序，本仓库在其基础上重构为 Web 应用，游戏规则与图像素材均沿用原作。

感谢原作者青月晓设计并开源了这个独特的复数扫雷，也感谢 [VoidForge](https://github.com/VoidForge) 等贡献者对原仓库的修复与改进。原作代码按 GPL-3.0 授权，本仓库的修改同样以 GPL-3.0 发布（见 `LICENSE`）。

## 规则

有四种雷：正实雷、负实雷、正虚雷和负虚雷，也就是 +1、−1、+i 和 −i。

一个格子显示的数是周围所有雷之和的模长。

因为周围最多 8 格，所以只可能出现 24 种数字：

0, 1, 2, 3, 4, 5, 6, 7, 8,
√2, √5, √10, √13, √17, √26, √29, √34, √37,
2√2, 2√5, 3√2, 4√2, 5√2, 2√10。

正负雷数量相等时会互相抵消，这种 1 正 1 负的正负对我们称为"抵消对"；
0 和空白不是一回事。空白格子表示周围完全没有雷；0 表示周围完全为抵消对。

当数字格子周围插上的旗帜数量等于真实雷数，且实虚比例符合真实比例或其倒数，则允许展开；可以利用这一点试探周围是否有抵消对。
谨记扫雷的胜利判定是翻开所有的格子，而不是插对全部的旗帜。

## 操作

| 操作 | 鼠标 | 触屏 |
| --- | --- | --- |
| 翻开格子 | 左键 | 点按 |
| 插旗（正实 → 负实 → 正虚 → 负虚 → 撤旗） | 右键 | 长按，或开启「插旗模式」后点按 |
| 展开格子 | 中键，或左右键同时点击 | 双击已翻开的格子 |
| 重开 | 点人脸按钮 | 同左 |
| 开局 | F2 | 「开局」按钮 |

## 难度

- 初级 9×9 · 10 雷
- 中级 16×16 · 40 雷
- 高级 30×16 · 99 雷
- 自定义：宽 9–40、高 9–30，可只定总雷数（类型随机撒），也可指定四种雷各自的精确配比

三档标准难度的最快通关纪录保存在浏览器 `localStorage`，自定义棋盘不计入。

## 本地开发

```bash
npm install      # 需要 Node.js ≥ 20
npm run dev      # 开发服务器（默认 http://localhost:5173）
```

## 构建与测试

```bash
npm run test       # 规则引擎与布局单测（vitest，对照桌面版自检点）
npm run typecheck  # TypeScript 严格检查
npm run build      # 静态产物输出到 dist/
npm run preview    # 本地预览构建产物
```

`dist/` 是纯静态文件，可部署到 GitHub Pages / Vercel / 任意静态托管。

## 项目结构

```
public/assets/   图像素材（图集 PNG + 槽位表 JSON、图标）
src/game/        规则引擎（纯 TypeScript，不依赖 DOM，可独立测试）
src/render/      Canvas 2D 渲染（图集加载、布局计算、绘制）
src/input/       鼠标 + 触屏输入 → 语义动作
src/app/         装配：计时、最高分纪录、对话框、工具条
tests/           vitest 单测
docs/ASSETS.md   素材授权说明
scripts/         图标生成等构建辅助脚本
```

## 素材与授权

代码按 GPL-3.0 授权（见 `LICENSE`）。图像素材分两类：扫雷原始图像素材的权利属于 Microsoft，**不在** GPL-3.0 授权范围内；新增素材由青月晓绘制，随仓库按 GPL-3.0 发布。详见 [docs/ASSETS.md](docs/ASSETS.md)。

本程序是独立复刻作品，与 Microsoft 公司无隶属关系。"Minesweeper"、"扫雷"及相关商标归各自权利人所有。
