// 界面文案集中一处（游戏本体仅中文，与原桌面版一致）。

export const APP_TITLE = '复扫雷 Complexweeper';
export const APP_VERSION = '1.2.0-web';

export const MODE_LABELS = { complex: '圆复数模式', hyper: '双曲复数模式（闵可夫斯基模式）' } as const;

export const HELP_TEXT = `在模式菜单中选择难度或自定义雷区，可查看该模式的最高分纪录。

圆复数模式：四种雷为正实雷、负实雷、正虚雷、负虚雷，即 +1、−1、+i、−i（i² = −1）。
数字为周围雷之和 a + bi 的模长 √(a² + b²)。
旗帜总数等于周围真实雷数，且实/虚旗数符合真实比例或其倒数，才能展开。

双曲复数模式（闵可夫斯基模式）：四种雷为正实雷（正类空雷）、负实雷（负类空雷）、正双曲虚雷（正类时雷）、负双曲虚雷（负类时雷），即 +1、−1、+j、−j。
双曲虚数单位（类时单位）j² = 1，数字为形式模长（时空间隔）√(a² − b²)，负值显示为带 i 的根式。
本模式只是从闵可夫斯基时空度规得来的灵感，跟广义相对论没有多大关系。
旗帜总数等于周围真实雷数，且旗帜净和的实部（类空部）、j 部（类时部）绝对值分别与真雷相同，才能展开。允许各自变号，不允许实/j 交换。

空白表示周围没有雷；0 可以由非空雷组合产生，不会连片翻开。
翻开所有非雷格子就胜利；结局会显示标对和标错的雷。

左键翻开格子。
右键插旗，依次为正实、负实、正单位旗、负单位旗，再清除（单位随模式为 i 或 j）。
中键或左右键同时点击展开格子。
F2开局。
触屏：点按翻开，长按插旗，双击已翻开的格子展开。
插旗模式：点按或左键循环插旗。
大棋盘可拖动浏览；电脑可用横向滚动。
触控笔：笔尖翻开，侧键插旗。

自定义：可设置总雷数并随机分配类型，或指定四种雷的配比。
音效：踩雷音按雷型区分，通关播放胜利音，每整秒播放计时音；默认开启，工具条可关闭，关闭时立即停止当前音效，并保存选择供下次打开使用。`;

export const ABOUT_TEXT = `${APP_TITLE} ${APP_VERSION}
基于 Microsoft® 扫雷（原版作者：Robert Donner、Curt Johnson）

本程序是 complexweeper（作者：青月晓）的 Web 移植版，
原仓库：github.com/Yueqing-Chen/complexweeper-A-minesweeper-game
感谢原作者及各位贡献者，原作与本修改版均按 GPL-3.0 发布。

已同步至上游 v1.2.0，包含圆复数模式、双曲复数模式（闵可夫斯基模式）、终局标记反馈、音效及声音偏好保存。

Web 移植与维护：miofelix
将原桌面程序重构为浏览器版本，完善桌面与手机操作、自定义配置、最高分纪录及 PWA 离线支持，并持续修复交互问题。
Web 仓库：github.com/miofelix/complexweeper-web

图像素材来源：Microsoft（扫雷原始图像素材）；青月晓（新增图像素材及合成音效）。
Copyright © 2026 青月晓
本程序为免费软件
与 Microsoft 公司无隶属关系`;

export const SCORE_LABELS = ['初级', '中级', '高级'] as const;

export const DLG = {
  title: '自定义雷区',
  height: '高度(H)：',
  width: '宽度(W)：',
  heightHint: '9 – 30 行',
  widthHint: '9 – 40 列',
  distribution: '雷类型：',
  randomTypes: '随机分配',
  exactTypes: '指定配比',
  total: '总雷数：',
  totalHint: '类型随机分配',
  names: ['正实雷：', '负实雷：', '正虚雷：', '负虚雷：'] as const,
  hyperNames: ['正实雷（正类空雷）：', '负实雷（负类空雷）：', '正双曲虚雷（正类时雷）：', '负双曲虚雷（负类时雷）：'] as const,
  split: '按合计均分',
  ok: '确定',
  cancel: '取消',
  errHeight: '高度要在 9 – 30 之间。',
  errWidth: '宽度要在 9 – 40 之间。',
  errCount: '雷数要填写非负整数。',
  errTotal: '总雷数要填写正整数。',
  errSumZero: '四种雷合计至少 1 颗。',
  errSumBig: '合计超过上限（格数 − 9）。',
};
