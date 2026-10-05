// 界面文案集中一处（游戏本体仅中文，与原桌面版一致）。

export const APP_TITLE = '复扫雷 Complexweeper';
export const APP_VERSION = '1.0.0';

export const HELP_TEXT = `雷区里有四种雷，分别是正实雷、负实雷、正虚雷、负虚雷。
左键翻开格子。
右键插旗，旗帜顺序为正实旗、负实旗、正虚旗、负虚旗。
中键或左右键同时点击展开格子。
F2开局。
触屏：点按翻开，长按插旗，双击已翻开的格子展开。

数字代表该格周围所有雷的加和之模长，均为整数或最简根式。

当旗帜数量等于周围真实雷数，且实虚比例符合真实比例或其倒数，则可以展开。`;

export const ABOUT_TEXT = `${APP_TITLE} ${APP_VERSION}
基于 Microsoft® 扫雷（原版作者：Robert Donner、Curt Johnson）

本程序是 complexweeper-A-minesweeper-game（作者：青月晓）的 Web 修改版，
原仓库：github.com/Yueqing-Chen/complexweeper-A-minesweeper-game
感谢原作者及各位贡献者，原作与本修改版均按 GPL-3.0 发布。

图像素材来源：Microsoft（扫雷原始图像素材）；青月晓（新增图像素材）。
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
  names: ['正实雷：', '负实雷：', '正虚雷：', '负虚雷：'] as const,
  split: '按合计均分',
  ok: '确定',
  cancel: '取消',
  errHeight: '高度要在 9 – 30 之间。',
  errWidth: '宽度要在 9 – 40 之间。',
  errSumZero: '四种雷合计至少 1 颗。',
  errSumBig: '合计超过上限（格数 − 9）。',
};
