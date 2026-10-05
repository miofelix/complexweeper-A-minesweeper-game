# Complexweeper

> [中文 README](README.md)

Minesweeper, but the mines are complex numbers: the four mine types are positive-real, negative-real, positive-imaginary, and negative-imaginary; the number on a cell is the magnitude of the sum of all mines around it.

Reveal every non-mine cell to win.

**A pure static web app**: Vite + TypeScript + Canvas 2D, no runtime dependencies, no backend. The build output can be hosted on any static platform and works offline as a PWA.

## Origin & Acknowledgements

This repository is a modified version (fork) of [Yueqing-Chen/complexweeper-A-minesweeper-game](https://github.com/Yueqing-Chen/complexweeper-A-minesweeper-game): the original is a Zig + Win32 desktop application developed by 青月晓 (Yueqing Chen), which this repository rebuilds as a web app. The game rules and image assets are carried over from the original work.

Many thanks to the original author 青月晓 for designing and open-sourcing this unique complex-number minesweeper, and to contributors such as [VoidForge](https://github.com/VoidForge) for their fixes and improvements to the original repository. The original code is licensed under GPL-3.0, and the modifications in this repository are published under the same license (see `LICENSE`).

## Rules

There are four mine types: positive-real, negative-real, positive-imaginary, and negative-imaginary — that is, +1, −1, +i, and −i.

The number shown on a cell is the magnitude of the sum of all mines around it.

Since a cell has at most 8 neighbors, only 24 values are possible:

0, 1, 2, 3, 4, 5, 6, 7, 8,
√2, √5, √10, √13, √17, √26, √29, √34, √37,
2√2, 2√5, 3√2, 4√2, 5√2, 2√10.

Equal numbers of positive and negative mines cancel out; we call such a positive/negative pair a "canceling pair".
Zero and blank are not the same: a blank cell has no mines around it at all, while a 0 means the surrounding mines consist entirely of canceling pairs.

You may expand around a numbered cell when the number of flags around it equals the true number of mines, and the real-to-imaginary ratio of the flags matches the true ratio or its reciprocal. You can use this to probe whether canceling pairs are nearby.
Remember: you win by revealing all non-mine cells, not by flagging every mine correctly.

## Controls

| Action | Mouse | Touch |
| --- | --- | --- |
| Reveal a cell | Left click | Tap |
| Cycle flag (+real → −real → +imag → −imag → clear) | Right click | Long press, or tap in "flag mode" |
| Expand around a cell | Middle click, or left+right together | Double-tap a revealed cell |
| Restart | Click the face button | Same |
| New game | F2 | "New game" button |

## Difficulty

- Beginner: 9×9, 10 mines
- Intermediate: 16×16, 40 mines
- Expert: 30×16, 99 mines
- Custom: width 9–40, height 9–30; set either a total mine count (types dealt at random) or an exact per-type mix

Best times for the three standard presets are stored in the browser's `localStorage`; custom boards are not recorded.

## Development

```bash
npm install      # requires Node.js ≥ 20
npm run dev      # dev server (default http://localhost:5173)
```

## Build & Test

```bash
npm run test       # rule-engine & layout unit tests (vitest, mirroring the desktop self-checks)
npm run typecheck  # strict TypeScript check
npm run build      # static output to dist/
npm run preview    # preview the production build locally
```

`dist/` is fully static and can be deployed to GitHub Pages / Vercel / any static host.

## Project Structure

```
public/assets/   image assets (sprite atlas PNG + slot JSON, icons)
src/game/        rule engine (pure TypeScript, no DOM, independently testable)
src/render/      Canvas 2D rendering (atlas loading, layout, painting)
src/input/       mouse + touch input → semantic actions
src/app/         glue: timer, best scores, dialogs, toolbar
tests/           vitest unit tests
docs/ASSETS.md   asset licensing notice
scripts/         build helpers (icon generation)
```

## Assets & License

The code is licensed under GPL-3.0 (see `LICENSE`). The image assets fall into two categories: the original Minesweeper graphics belong to Microsoft and are **not** covered by GPL-3.0; the new graphics were drawn by 青月晓 and are published with the repository under GPL-3.0. See [docs/ASSETS.md](docs/ASSETS.md) for details.

This is an independent re-implementation and is not affiliated with Microsoft. "Minesweeper" and related trademarks belong to their respective owners.
