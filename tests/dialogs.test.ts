// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDialog, isDialogOpen, showCustomDialog, showHelp, showScores } from '../src/app/dialogs';
import { DLG } from '../src/app/strings';

const current = { w: 9, h: 9, mines: 10, typeCount: [0, 3, 3, 2, 2] };

function fields(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('.dlg-box input'));
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.dlg-box button'));
}

function press(element: HTMLElement, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  element.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<main><button id="opener">Custom</button></main><div id="already-inert"></div>';
  document.getElementById('already-inert')!.inert = true;
  document.getElementById('opener')!.focus();
});

afterEach(() => {
  closeDialog();
  document.body.replaceChildren();
});

describe('modal dialogs', () => {
  it('labels the modal and custom inputs and restores background state and opener focus', async () => {
    const main = document.querySelector('main')!;
    const previousInert = main.inert;
    const result = showCustomDialog(current);
    const box = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toBe(DLG.title);
    for (const input of fields()) {
      expect(input.labels?.length).toBe(1);
      expect(input.labels?.[0].textContent).toBeTruthy();
      for (const id of input.getAttribute('aria-describedby')!.split(' ')) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    }
    expect(main.inert).toBe(true);
    expect(document.activeElement).toBe(fields()[0]);
    closeDialog();
    expect(await result).toEqual({ applied: false });
    expect(main.inert).toBe(previousInert);
    expect(document.getElementById('already-inert')!.inert).toBe(true);
    expect(document.activeElement?.id).toBe('opener');
  });

  it('wraps focus at both ends and returns escaped focus to the modal', () => {
    void showCustomDialog(current);
    const first = fields()[0];
    const last = buttons().at(-1)!;
    expect(press(first, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(press(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    document.getElementById('opener')!.focus();
    expect(document.activeElement).toBe(first);
  });

  it('keeps the single action of an informational dialog focused', () => {
    showHelp();
    const ok = buttons()[0];
    expect(document.activeElement).toBe(ok);
    expect(press(ok, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ok);
    expect(press(ok, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ok);
  });

  it.each(['direct', 'escape', 'backdrop', 'cancel', 'replacement'] as const)(
    'settles custom cancellation after %s closure', async (action) => {
      const result = showCustomDialog(current);
      if (action === 'direct') closeDialog();
      if (action === 'escape') press(fields()[0], 'Escape');
      if (action === 'backdrop') document.querySelector<HTMLElement>('.dlg-overlay')!.click();
      if (action === 'cancel') buttons().at(-1)!.click();
      if (action === 'replacement') showScores({ best: [0, 0, 0] }, false);
      expect(await result).toEqual({ applied: false });
      expect(isDialogOpen()).toBe(action === 'replacement');
      if (action === 'replacement') {
        buttons()[0].click();
        expect(document.activeElement?.id).toBe('opener');
      }
    },
  );

  it('ignores Escape during input method composition', async () => {
    const result = showCustomDialog(current);
    press(fields()[0], 'Escape', { isComposing: true });
    expect(isDialogOpen()).toBe(true);
    closeDialog();
    expect(await result).toEqual({ applied: false });
  });
});

describe('custom board validation', () => {
  it.each(['', '-9', '9.5', '9abc', '1e1', 'Infinity', '9007199254740993'])(
    'rejects malformed height %j instead of changing its meaning', async (value) => {
      const result = showCustomDialog(current);
      const height = fields()[0];
      height.value = value;
      buttons()[1].click();
      expect(isDialogOpen()).toBe(true);
      expect(height.value).toBe(value);
      expect(height.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(height);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(DLG.errHeight);
      closeDialog();
      expect(await result).toEqual({ applied: false });
    },
  );

  it.each(['', '-1', '1.5', '2abc', '1e2', '9007199254740993'])(
    'rejects malformed mine count %j and identifies its field', async (value) => {
      const result = showCustomDialog(current);
      const count = fields()[3];
      count.value = value;
      buttons()[1].click();
      expect(isDialogOpen()).toBe(true);
      expect(count.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(count);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(DLG.errCount);
      closeDialog();
      expect(await result).toEqual({ applied: false });
    },
  );

  it('identifies invalid width and clears stale error state while editing', async () => {
    const result = showCustomDialog(current);
    const width = fields()[1];
    width.value = '41';
    buttons()[1].click();
    expect(document.activeElement).toBe(width);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DLG.errWidth);
    width.value = '9';
    width.dispatchEvent(new Event('input', { bubbles: true }));
    expect(width.hasAttribute('aria-invalid')).toBe(false);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('');
    buttons()[1].click();
    expect(await result).toMatchObject({ applied: true, config: { w: 9 } });
  });

  it.each([
    { count: 0, message: DLG.errSumZero },
    { count: 73, message: DLG.errSumBig },
  ])('rejects invalid total $count and focuses the counts', async ({ count, message }) => {
    const result = showCustomDialog(current);
    const mineInputs = fields().slice(2);
    mineInputs.forEach((input, index) => { input.value = String(index === 0 ? count : 0); });
    buttons()[1].click();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(mineInputs.every((input) => input.getAttribute('aria-invalid') === 'true')).toBe(true);
    expect(document.activeElement).toBe(mineInputs[0]);
    closeDialog();
    expect(await result).toEqual({ applied: false });
  });

  it('submits Enter from a field and accepts surrounding whitespace and leading zeros', async () => {
    const result = showCustomDialog(current);
    fields()[0].value = ' 009 ';
    const event = press(fields()[0], 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(await result).toEqual({ applied: true, config: { w: 9, h: 9, mines: 10, typeCount: [0, 3, 3, 2, 2] } });
  });

  it('leaves Enter on Cancel and Split to the focused button', async () => {
    const result = showCustomDialog(current);
    const [split, , cancel] = buttons();
    for (const button of [split, cancel]) {
      button.focus();
      expect(press(button, 'Enter').defaultPrevented).toBe(false);
      expect(isDialogOpen()).toBe(true);
    }
    cancel.click();
    expect(await result).toEqual({ applied: false });
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])('does not submit during IME composition %j', async (options) => {
    const result = showCustomDialog(current);
    expect(press(fields()[0], 'Enter', options).defaultPrevented).toBe(false);
    expect(isDialogOpen()).toBe(true);
    closeDialog();
    expect(await result).toEqual({ applied: false });
  });

  it('preserves legal totals above 999 when distributing and applying the mix', async () => {
    const result = showCustomDialog({ w: 40, h: 30, mines: 1100, typeCount: [0, 1100, 0, 0, 0] });
    buttons()[0].click();
    expect(fields().slice(2).map((input) => Number(input.value))).toEqual([275, 275, 275, 275]);
    buttons()[1].click();
    expect(await result).toEqual({ applied: true, config: { w: 40, h: 30, mines: 1100, typeCount: [0, 275, 275, 275, 275] } });
  });

  it('preserves zero totals when splitting and reports malformed counts without rewriting them', async () => {
    const result = showCustomDialog(current);
    fields().slice(2).forEach((input) => { input.value = '0'; });
    buttons()[0].click();
    expect(fields().slice(2).map((input) => input.value)).toEqual(['0', '0', '0', '0']);
    fields()[2].value = '-1';
    buttons()[0].click();
    expect(fields()[2].value).toBe('-1');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DLG.errCount);
    closeDialog();
    expect(await result).toEqual({ applied: false });
  });
});
