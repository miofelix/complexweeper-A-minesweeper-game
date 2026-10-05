import { App } from './app/app';
import { APP_TITLE } from './app/strings';

document.title = APP_TITLE;

const canvas = document.getElementById('board') as HTMLCanvasElement | null;
if (!canvas) throw new Error('找不到 #board 画布');

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 注册失败不影响游玩（例如非安全上下文）
    });
  });
}

const app = new App(canvas);
(window as unknown as { __cw_state?: () => string }).__cw_state = () => app.debugState();
app.start().catch((err) => {
  const el = document.getElementById('fatal');
  if (el) el.textContent = `启动失败：${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
