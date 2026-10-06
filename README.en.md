# Complexweeper (Web)

> [中文 README](README.md)

Minesweeper, but the mines are complex numbers. Choose complex or split-complex mode; a cell shows the magnitude (or formal magnitude) of the sum of the surrounding mines.

Reveal every non-mine cell to win.
At the end, checkmarks and crosses show correctly and incorrectly identified mines, with sound effects for each mine type and for winning.

**A pure static web app**: Vite + TypeScript + Canvas 2D, no runtime dependencies, no backend. The build output can be hosted on any static platform and works offline as a PWA.

**Play online**: https://miofelix.github.io/complexweeper-web/

## Origin & Acknowledgements

This repository is a modified version (fork) of [Yueqing-Chen/complexweeper-A-minesweeper-game](https://github.com/Yueqing-Chen/complexweeper-A-minesweeper-game): the original is a Zig + Win32 desktop application developed by 青月晓 (Yueqing Chen), which this repository rebuilds as a web app. The game rules and image assets are carried over from the original work. This repository is the web port, maintained by [@miofelix](https://github.com/miofelix); for the desktop original, see the upstream repository.

Many thanks to the original author 青月晓 for designing and open-sourcing this unique complex-number minesweeper, and to contributors such as [VoidForge](https://github.com/VoidForge) for their fixes and improvements to the original repository. The original code is licensed under GPL-3.0, and the modifications in this repository are published under the same license (see `LICENSE`).

Upstream features have been ported from the original fork point `577750e` (v1.0.12) through `8932be5` (v1.1.3). See [docs/UPSTREAM.md](docs/UPSTREAM.md) for the scope and future synchronization steps.

## Rules

**Complex mode** has four mine types: positive-real, negative-real, positive-imaginary, and negative-imaginary — that is, +1, −1, +i, and −i.

The number shown on a cell is the magnitude of the sum of all mines around it.

Since a cell has at most 8 neighbors, only 24 values are possible:

0, 1, 2, 3, 4, 5, 6, 7, 8,
√2, √5, √10, √13, √17, √26, √29, √34, √37,
2√2, 2√5, 3√2, 4√2, 5√2, 2√10.

Equal numbers of positive and negative mines cancel out; we call such a positive/negative pair a "canceling pair".
Zero and blank are not the same: a blank cell has no mines around it at all, while a 0 means the surrounding mines consist entirely of canceling pairs.

You may expand around a numbered cell when the number of flags around it equals the true number of mines, and the real-to-imaginary ratio of the flags matches the true ratio or its reciprocal. You can use this to probe whether canceling pairs are nearby.
Remember: you win by revealing all non-mine cells, not by flagging every mine correctly.

**Split-complex mode** uses +1, −1, +j, and −j, with j² = 1. For a neighborhood sum a + bj, the clue is √(a² − b²); a negative value becomes an imaginary radical, so a = 0 and b = 2 displays 2i. There are 39 possible display values.

Expansion requires the correct total flag count and matching absolute real and j components of the flag and mine sums. Each component may change sign independently, but the components cannot be swapped. A nonempty neighborhood such as 1 + j can display 0; it does not flood open as a blank cell.

Each mode menu contains its three presets, custom settings, and records. Selecting a preset or applying custom settings starts a new game; viewing records does not change the current board.

## Controls

| Action | Mouse | Touch |
| --- | --- | --- |
| Reveal a cell | Left click | Tap |
| Cycle flag (+real → −real → +imag → −imag → clear) | Right click | Long press, or tap in "flag mode" |
| Expand around a cell | Middle click, or left+right together | Double-tap a revealed cell |
| Restart | Click the face button | Same |
| New game | F2 | "New game" button |

Flag mode also makes left clicks cycle flags. With a pen, the tip reveals and the barrel button cycles flags. Large boards scroll horizontally; on touch screens, drag to pan without revealing a cell.

The third and fourth flags use i or j according to the mode. Four mine sounds, a victory sound, and a once-per-second timer tick can be muted with the sound button.

## Difficulty

- Beginner: 9×9, 10 mines
- Intermediate: 16×16, 40 mines
- Expert: 30×16, 99 mines
- Custom: width 9–40, height 9–30; set either a total mine count (types dealt at random) or an exact per-type mix

The custom dialog's distribution selector switches between random types and an exact mix. Changing the mode keeps your entries in both modes.

Each mode has independent best times for the three standard presets, stored in the browser's `localStorage`. Existing complex-mode records are preserved; custom boards are not recorded.

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
public/assets/   image assets (sprite atlas PNG + slot JSON, icons), plus sounds/
src/game/        rule engine (pure TypeScript, no DOM, independently testable)
src/render/      Canvas 2D rendering (atlas loading, layout, painting)
src/input/       mouse + touch input → semantic actions
src/app/         glue: timer, best scores, dialogs, toolbar
tests/           vitest unit tests
docs/           asset licensing and upstream synchronization notes
scripts/         build helpers (icon generation)
```

## Assets & License

The code is licensed under GPL-3.0 (see `LICENSE`). The image assets fall into two categories: the original Minesweeper graphics belong to Microsoft and are **not** covered by GPL-3.0; the new graphics were drawn by 青月晓 and are published with the repository under GPL-3.0. See [docs/ASSETS.md](docs/ASSETS.md) for details.

This is an independent re-implementation and is not affiliated with Microsoft. "Minesweeper" and related trademarks belong to their respective owners.
