/* Light / dark theme. Runs in <head> so the page never flashes the wrong theme.
   First visit follows the phone/computer setting; a choice made with the button is remembered. */
(() => {
  'use strict';
  const KEY = 'emcc-theme';
  const root = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try { const t = localStorage.getItem(KEY); return t === 'dark' || t === 'light' ? t : null; } catch (e) { return null; } };

  function apply(t, announce) {
    root.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#101c30' : '#13233b';
    const b = document.getElementById('theme-btn');
    if (b) {
      b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      b.querySelector('.theme-label').textContent = t === 'dark' ? 'ธีมสว่าง' : 'ธีมมืด';
      b.title = t === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด';
    }
    if (announce) window.dispatchEvent(new CustomEvent('emcc-theme', { detail: t }));
  }

  apply(saved() || (mq.matches ? 'dark' : 'light'), false);

  // follow the system setting until the person picks a theme themselves
  mq.addEventListener?.('change', (e) => { if (!saved()) apply(e.matches ? 'dark' : 'light', true); });

  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme, false); // fill in the button label
    const b = document.getElementById('theme-btn');
    if (!b) return;
    b.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* still switches for this visit */ }
      apply(next, true);
    });
  });
})();
