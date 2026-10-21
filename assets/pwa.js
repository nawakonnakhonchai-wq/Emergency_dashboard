/* Installable app: register the service worker and offer an "install" button. */
(() => {
  'use strict';
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* site still works without it */ });
    });
  }

  let deferred = null;
  const btn = () => document.getElementById('install');
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const b = btn();
    if (b && !standalone()) b.hidden = false;
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    const b = btn(); if (b) b.hidden = true;
  });
  document.addEventListener('DOMContentLoaded', () => {
    const b = btn();
    if (!b) return;
    b.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null;
      b.hidden = true;
    });
  });
})();
