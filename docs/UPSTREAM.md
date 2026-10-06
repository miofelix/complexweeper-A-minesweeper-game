# 上游同步记录

上游：[Yueqing-Chen/complexweeper-A-minesweeper-game](https://github.com/Yueqing-Chen/complexweeper-A-minesweeper-game)

最初分叉点：`577750eae65f0832bcf6ffd51e68ef7ebe81f767`（v1.0.12）。

本次同步：`8932be562f9267a288055a0fed996197e709bbe0`（v1.1.3，2026-10-06 获取），覆盖分叉点之后的 26 个提交。

本仓库将 Zig + Win32 桌面版重写为 TypeScript Web 版，因此通过移植规则、界面行为与素材同步；Git 的共同祖先仍是最初分叉点。

## 已移植

- v1.0.13：原始六段 WAV 音效，四类踩雷、通关及每整秒计时；Web 添加音效开关，用户操作后解锁浏览器音频。
- v1.1.x：双曲复数模式（j² = 1），有符号提示值 a² − b²，以及推荐展开判据。规则引擎同时保留上游的备选宽松判据 `judge_loose`；界面使用推荐判据。
- 最新透明图集：双曲数字、±j 雷与旗、j 计雷器以及终局正错标记；图集 PNG/JSON 原样采用上游文件。
- 失败时按真实雷型显示标对/标错的雷，胜利时显示标对/标错的旗，给空格插旗单独显示错误空格。
- 每个模式独立的难度、自定义和纪录菜单；标题固定，雷名随模式变化。
- 玩法和素材文案。

复数模式继续使用原 `complexweeper-web.scores.v1` 存储键，双曲模式使用 `complexweeper-web.scores.hyper.v1`。自定义取消不会改变模式；从目标模式菜单应用自定义时会正确切换到该模式。双曲展开规则以 `game.zig` 实际实现为准：旗数相等，且净和 |a|、|b| 分别匹配。

Web 版保留现有触屏/触控笔操作、拖动浏览、模态焦点管理、自定义随机配比、跨标签纪录合并、开局即时胜利判定与 PWA 完整预缓存。桌面构建、自检和 Win32 包装的变更不适用于 Web 运行环境。

## 后续同步

```bash
git fetch upstream --prune
git log --oneline 8932be5..upstream/main
git diff 8932be5..upstream/main -- '正式版/src/game.zig' '正式版/src/main.zig' '素材/' '素材说明.md'
```

按这里记录的同步点比较后续变更，移植到对应 TypeScript 模块并更新本记录。音效可重新从指定上游提交提取：

```bash
node scripts/extract-sounds.mjs 8932be5
```

验证使用 `npm run typecheck`、`npm test` 和 `npm run build`。构建会把所有图集、WAV 和应用文件列入 PWA 预缓存。
