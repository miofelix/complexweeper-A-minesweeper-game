// 对话框：自定义棋盘 / 最高分纪录 / 玩法与操作 / 关于。经典扫雷风格的白底弹窗。

import { splitEvenly } from '../game/game';
import { ABOUT_TEXT, DLG, HELP_TEXT, SCORE_LABELS } from './strings';
import type { Scores } from './storage';

export interface CustomConfig {
  w: number;
  h: number;
  /** 四类精确配比（下标 1..4），全 0 = 类型随机撒 */
  typeCount: number[];
  /** Total mines; typeCount sums to this only in exact mode. */
  mines: number;
}

interface DialogState {
  overlay: HTMLDivElement;
  returnFocus: HTMLElement | null;
  background: { element: HTMLElement; inert: boolean }[];
  onClose?: () => void;
  keydown: (e: KeyboardEvent) => void;
  focusin: (e: FocusEvent) => void;
}

let dialog: DialogState | null = null;
let dialogId = 0;

function focusableElements(box: HTMLElement): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
    .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden]'));
}

function openDialog(title: string, body: HTMLElement, onClose?: () => void): void {
  closeDialog();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'dlg-overlay';
  const box = document.createElement('div');
  box.className = 'dlg-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.tabIndex = -1;
  const head = document.createElement('div');
  head.id = `dlg-title-${++dialogId}`;
  head.className = 'dlg-title';
  head.textContent = title;
  box.setAttribute('aria-labelledby', head.id);
  box.appendChild(head);
  box.appendChild(body);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
  });
  const keydown = (e: KeyboardEvent): void => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDialog();
    } else if (e.key === 'Tab') {
      const controls = focusableElements(box);
      const first = controls[0] ?? box;
      const last = controls[controls.length - 1] ?? box;
      if (!box.contains(document.activeElement) || controls.length === 0) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const focusin = (e: FocusEvent): void => {
    if (e.target instanceof Node && !box.contains(e.target)) {
      (focusableElements(box)[0] ?? box).focus({ preventScroll: true });
    }
  };
  const background = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .map((element) => ({ element, inert: element.inert }));
  background.forEach(({ element }) => { element.inert = true; });
  dialog = { overlay, returnFocus, background, onClose, keydown, focusin };
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('focusin', focusin);
  document.body.appendChild(overlay);
  (focusableElements(box)[0] ?? box).focus({ preventScroll: true });
}

export function closeDialog(): void {
  if (!dialog) return;
  const closed = dialog;
  dialog = null;
  document.removeEventListener('keydown', closed.keydown, true);
  document.removeEventListener('focusin', closed.focusin);
  closed.overlay.remove();
  closed.background.forEach(({ element, inert }) => { element.inert = inert; });
  if (closed.returnFocus?.isConnected) closed.returnFocus.focus({ preventScroll: true });
  closed.onClose?.();
}

export function isDialogOpen(): boolean {
  return dialog !== null;
}

function makeButton(label: string, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
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
    err.id = 'dlg-custom-error';
    err.className = 'dlg-error';
    err.setAttribute('role', 'alert');

    const inputs: HTMLInputElement[] = [];
    const mkInput = (label: HTMLLabelElement, id: string, value: number): HTMLInputElement => {
      const input = document.createElement('input');
      input.id = id;
      label.htmlFor = id;
      input.type = 'text';
      input.inputMode = 'numeric';
      input.value = String(value);
      input.setAttribute('aria-describedby', err.id);
      inputs.push(input);
      return input;
    };
    const mkRow = (id: string, labelText: string, hint: string, value: number): HTMLInputElement => {
      const row = document.createElement('div');
      row.className = 'dlg-row';
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = mkInput(label, id, value);
      const span = document.createElement('span');
      span.id = `${id}-hint`;
      span.className = 'dlg-hint';
      span.textContent = hint;
      input.setAttribute('aria-describedby', `${span.id} ${err.id}`);
      row.append(label, input, span);
      body.appendChild(row);
      return input;
    };

    const hInput = mkRow('dlg-custom-height', DLG.height, DLG.heightHint, current.h);
    const wInput = mkRow('dlg-custom-width', DLG.width, DLG.widthHint, current.w);

    const hasExactMix = current.typeCount.some((v, i) => i > 0 && v > 0);
    const modeRow = document.createElement('div');
    modeRow.className = 'dlg-row';
    const modeLabel = document.createElement('label');
    modeLabel.htmlFor = 'dlg-custom-mode';
    modeLabel.textContent = DLG.distribution;
    const mode = document.createElement('select');
    mode.id = modeLabel.htmlFor;
    for (const [value, label] of [['random', DLG.randomTypes], ['exact', DLG.exactTypes]]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      mode.appendChild(option);
    }
    mode.value = hasExactMix ? 'exact' : 'random';
    modeRow.append(modeLabel, mode);
    body.appendChild(modeRow);

    const totalInput = mkRow('dlg-custom-total', DLG.total, DLG.totalHint, current.mines);
    const totalRow = totalInput.parentElement!;

    // 四类雷配比（两列排布）
    const grid = document.createElement('div');
    grid.className = 'dlg-grid';
    const tc = hasExactMix ? current.typeCount : splitEvenly(current.mines);
    const tInputs: HTMLInputElement[] = [];
    DLG.names.forEach((name, k) => {
      const cell = document.createElement('div');
      cell.className = 'dlg-row';
      const label = document.createElement('label');
      label.textContent = name;
      const input = mkInput(label, `dlg-custom-type-${k + 1}`, tc[k + 1]);
      cell.append(label, input);
      grid.appendChild(cell);
      tInputs.push(input);
    });
    body.appendChild(grid);

    const clearError = (): void => {
      err.textContent = '';
      inputs.forEach((input) => input.removeAttribute('aria-invalid'));
    };
    const showError = (message: string, invalid: HTMLInputElement[]): void => {
      err.textContent = message;
      invalid.forEach((input) => input.setAttribute('aria-invalid', 'true'));
      invalid[0].focus();
    };
    const readCounts = (): number[] | null => {
      const counts = [0];
      for (const input of tInputs) {
        const value = readInt(input);
        if (value === null) {
          showError(DLG.errCount, [input]);
          return null;
        }
        counts.push(value);
      }
      if (!Number.isSafeInteger(counts.reduce((sum, n) => sum + n, 0))) {
        showError(DLG.errSumBig, tInputs);
        return null;
      }
      return counts;
    };
    body.addEventListener('input', clearError);

    const midRow = document.createElement('div');
    midRow.className = 'dlg-row';
    const splitBtn = makeButton(DLG.split);
    splitBtn.addEventListener('click', () => {
      clearError();
      const counts = readCounts();
      if (!counts) return;
      const sp = splitEvenly(counts.reduce((sum, n) => sum + n, 0));
      tInputs.forEach((inp, i) => (inp.value = String(sp[i + 1])));
    });
    midRow.append(splitBtn, err);
    body.appendChild(midRow);

    // Hidden fields are disabled so they neither trap focus nor submit values.
    const updateMode = (): void => {
      const exact = mode.value === 'exact';
      totalRow.hidden = exact;
      totalInput.disabled = exact;
      grid.hidden = !exact;
      tInputs.forEach((input) => { input.disabled = !exact; });
      splitBtn.hidden = !exact;
      splitBtn.disabled = !exact;
      clearError();
    };
    mode.addEventListener('change', updateMode);
    updateMode();

    const actions = document.createElement('div');
    actions.className = 'dlg-actions';
    const okBtn = makeButton(DLG.ok, true);
    const cancelBtn = makeButton(DLG.cancel);
    actions.append(okBtn, cancelBtn);
    body.appendChild(actions);

    let result: CustomDialogResult = { applied: false };
    cancelBtn.addEventListener('click', () => closeDialog());

    okBtn.addEventListener('click', () => {
      clearError();
      const h = readInt(hInput);
      const w = readInt(wInput);
      if (h === null || h < 9 || h > 30) return showError(DLG.errHeight, [hInput]);
      if (w === null || w < 9 || w > 40) return showError(DLG.errWidth, [wInput]);
      if (mode.value === 'random') {
        const total = readInt(totalInput);
        if (total === null || total < 1) return showError(DLG.errTotal, [totalInput]);
        if (total > w * h - 9) return showError(DLG.errSumBig, [totalInput]);
        result = { applied: true, config: { w, h, mines: total, typeCount: [0, 0, 0, 0, 0] } };
        closeDialog();
        return;
      }
      const counts = readCounts();
      if (!counts) return;
      const sum = counts[1] + counts[2] + counts[3] + counts[4];
      if (sum < 1) return showError(DLG.errSumZero, tInputs);
      if (sum > w * h - 9) return showError(DLG.errSumBig, tInputs);
      result = { applied: true, config: { w, h, typeCount: counts, mines: sum } };
      closeDialog();
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        okBtn.click();
      }
    });

    openDialog(DLG.title, body, () => resolve(result));
  });
}

function readInt(input: HTMLInputElement): number | null {
  const value = input.value.trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
