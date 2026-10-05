// 对话框：自定义棋盘 / 最高分纪录 / 玩法与操作 / 关于。经典扫雷风格的白底弹窗。

import { splitEvenly } from '../game/game';
import { ABOUT_TEXT, DLG, HELP_TEXT, SCORE_LABELS } from './strings';
import type { Scores } from './storage';

export interface CustomConfig {
  w: number;
  h: number;
  /** 四类精确配比（下标 1..4），全 0 = 类型随机撒 */
  typeCount: number[];
  /** 总雷数（= typeCount 合计） */
  mines: number;
}

let overlay: HTMLDivElement | null = null;

function openDialog(title: string, body: HTMLElement, onClose?: () => void): void {
  closeDialog();
  overlay = document.createElement('div');
  overlay.className = 'dlg-overlay';
  const box = document.createElement('div');
  box.className = 'dlg-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'dlg-title';
  head.textContent = title;
  box.appendChild(head);
  box.appendChild(body);
  overlay.appendChild(box);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      closeDialog();
      onClose?.();
    }
  });
  document.addEventListener('keydown', escClose);
  document.body.appendChild(overlay);

  function escClose(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      closeDialog();
      onClose?.();
    }
  }
  (overlay as any).__esc = escClose;
}

export function closeDialog(): void {
  if (overlay) {
    document.removeEventListener('keydown', (overlay as any).__esc);
    overlay.remove();
    overlay = null;
  }
}

export function isDialogOpen(): boolean {
  return overlay !== null;
}

function makeButton(label: string, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = primary ? 'dlg-btn primary' : 'dlg-btn';
  return b;
}

function makeInfoBody(text: string): HTMLElement {
  const body = document.createElement('div');
  body.className = 'dlg-body';
  const pre = document.createElement('div');
  pre.className = 'dlg-text';
  pre.textContent = text;
  body.appendChild(pre);
  const row = document.createElement('div');
  row.className = 'dlg-actions';
  const ok = makeButton('确定', true);
  ok.addEventListener('click', () => closeDialog());
  row.appendChild(ok);
  body.appendChild(row);
  queueMicrotask(() => ok.focus());
  return body;
}

export function showHelp(): void {
  openDialog('玩法与操作', makeInfoBody(HELP_TEXT));
}

export function showAbout(): void {
  openDialog('关于复扫雷', makeInfoBody(ABOUT_TEXT));
}

export function showScores(scores: Scores, highlight: boolean): void {
  const body = document.createElement('div');
  body.className = 'dlg-body';
  const list = document.createElement('div');
  list.className = 'dlg-text';
  list.style.fontVariantNumeric = 'tabular-nums';
  const lines = SCORE_LABELS.map((label, i) => {
    const v = scores.best[i];
    return `${label}      ${v > 0 ? `${v} 秒` : '———'}`;
  });
  list.textContent = lines.join('\n');
  body.appendChild(list);
  const row = document.createElement('div');
  row.className = 'dlg-actions';
  const ok = makeButton('确定', true);
  ok.addEventListener('click', () => closeDialog());
  row.appendChild(ok);
  body.appendChild(row);
  openDialog(highlight ? '新纪录！' : '最高分纪录', body);
  queueMicrotask(() => ok.focus());
}

export interface CustomDialogResult {
  applied: boolean;
  config?: CustomConfig;
}

/** 自定义雷区对话框。校验规则与桌面版一致。 */
export function showCustomDialog(current: { w: number; h: number; mines: number; typeCount: number[] }): Promise<CustomDialogResult> {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'dlg-body dlg-custom';

    const err = document.createElement('div');
    err.className = 'dlg-error';

    const inputs: HTMLInputElement[] = [];
    const mkRow = (labelText: string, hint: string, value: number): HTMLInputElement => {
      const row = document.createElement('div');
      row.className = 'dlg-row';
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.value = String(value);
      const span = document.createElement('span');
      span.className = 'dlg-hint';
      span.textContent = hint;
      row.append(label, input, span);
      body.appendChild(row);
      inputs.push(input);
      return input;
    };

    const hInput = mkRow(DLG.height, DLG.heightHint, current.h);
    const wInput = mkRow(DLG.width, DLG.widthHint, current.w);

    // 四类雷配比（两列排布）
    const grid = document.createElement('div');
    grid.className = 'dlg-grid';
    const tc = current.typeCount.some((v, i) => i > 0 && v > 0)
      ? current.typeCount
      : splitEvenly(current.mines);
    const tInputs: HTMLInputElement[] = [];
    DLG.names.forEach((name, k) => {
      const cell = document.createElement('div');
      cell.className = 'dlg-row';
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.value = String(tc[k + 1]);
      cell.append(label, input);
      grid.appendChild(cell);
      tInputs.push(input);
    });
    body.appendChild(grid);

    const midRow = document.createElement('div');
    midRow.className = 'dlg-row';
    const splitBtn = makeButton(DLG.split);
    splitBtn.addEventListener('click', () => {
      const sum = readInt(tInputs[0]) + readInt(tInputs[1]) + readInt(tInputs[2]) + readInt(tInputs[3]);
      const sp = splitEvenly(Math.min(sum > 0 ? sum : 99, 999));
      tInputs.forEach((inp, i) => (inp.value = String(sp[i + 1])));
    });
    midRow.append(splitBtn, err);
    body.appendChild(midRow);

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';
    const okBtn = makeButton(DLG.ok, true);
    const cancelBtn = makeButton(DLG.cancel);
    actions.append(okBtn, cancelBtn);
    body.appendChild(actions);

    const done = (applied: boolean, config?: CustomConfig): void => {
      closeDialog();
      resolve({ applied, config });
    };
    cancelBtn.addEventListener('click', () => done(false));

    okBtn.addEventListener('click', () => {
      const h = readInt(hInput, 16);
      const w = readInt(wInput, 30);
      const counts = [0, ...tInputs.map((i) => readInt(i))];
      const sum = counts[1] + counts[2] + counts[3] + counts[4];
      if (h < 9 || h > 30) return void (err.textContent = DLG.errHeight);
      if (w < 9 || w > 40) return void (err.textContent = DLG.errWidth);
      if (sum < 1) return void (err.textContent = DLG.errSumZero);
      if (sum > w * h - 9) return void (err.textContent = DLG.errSumBig);
      done(true, { w, h, typeCount: counts, mines: sum });
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') okBtn.click();
    });

    openDialog(DLG.title, body, () => resolve({ applied: false }));
    queueMicrotask(() => hInput.focus());
  });
}

function readInt(input: HTMLInputElement, fallback = 0): number {
  const digits = input.value.replace(/[^0-9]/g, '');
  if (!digits) return fallback;
  return Math.min(parseInt(digits, 10), 100000);
}
