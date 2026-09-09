(() => {
  'use strict';
  const mode = document.body.dataset.mode;
  const widget = document.getElementById('ct-widget');
  const popcard = document.getElementById('ct-popcard');
  const closeButton = document.getElementById('chat-close');
  const widgetOrigin = 'https://connect.campusthreads.co';
  const popcardOrigin = 'https://ct-popcard.web.app';
  const menu = document.getElementById('site-menu');
  const menuToggle = document.getElementById('menu-toggle');
  let chatOpen = false;
  let inlineInView = false;
  let popcardDismissed = false;
  let lastChatTrigger = null;
  const cornerChat = mode === 'corner' ? createCornerChat(widget, popcard, closeButton) : null;
  const closeMenu = () => {
    menu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  };
  menuToggle.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  const setChatOpen = (open, external = false) => {
    if (mode !== 'corner') return;
    chatOpen = open;
    cornerChat.setOpen(open, external);
    if (!open) (lastChatTrigger?.hidden ? popcard : lastChatTrigger)?.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-chat]').forEach(trigger => trigger.addEventListener('click', event => {
    event.preventDefault();
    closeMenu();
    lastChatTrigger = trigger;
    if (mode === 'corner') setChatOpen(true, true);
    else scrollToWidget();
  }));
  closeButton?.addEventListener('click', () => setChatOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(); menuToggle.focus(); }
    if (chatOpen) setChatOpen(false);
  });
  const scrollToWidget = () => {
    const headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
    const top = window.scrollY + widget.getBoundingClientRect().top - headerHeight - 12;
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const resize = () => {
    const dimensions = { width: window.innerWidth, height: window.innerHeight };
    // The actual iframe width controls the widget layout; no legacy scaling.
    widget.contentWindow?.postMessage({ ...dimensions, type: 'CT_WLG' }, widgetOrigin);
    popcard?.contentWindow?.postMessage({ ...dimensions, type: window.innerWidth < 500 ? 'CT_WSM' : 'CT_WLG' }, popcardOrigin);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('message', event => {
    const fromWidget = event.source === widget.contentWindow && event.origin === widgetOrigin;
    const fromPopcard = popcard && event.source === popcard.contentWindow && event.origin === popcardOrigin;
    if (!fromWidget && !fromPopcard) return;
    const type = event.data?.type;
    if (fromWidget && type === 'CT_RXI') {
      event.source.postMessage({ type: 'CT_TXI', url: window.location.href }, widgetOrigin);
      resize();
    }
    if (!fromPopcard) return;
    if (type === 'CT_PRXI') {
      event.source.postMessage({ type: 'CT_PTXI', url: window.location.href }, popcardOrigin);
      resize();
      if (mode === 'inline') event.source.postMessage({ type: inlineInView ? 'CT_WIV' : 'CT_WOV' }, popcardOrigin);
    }
    if (type === 'CT_PCTA' && mode === 'inline') scrollToWidget();
    if (type === 'CT_CWOR') setChatOpen(true);
    if (type === 'CT_CWCR') setChatOpen(false);
    if (type === 'CT_CWRZ') resize();
    if (type === 'CT_CLOSE') { setChatOpen(false); popcardDismissed = true; popcard.hidden = true; }
  });
  if (mode === 'inline' && popcard) {
    new IntersectionObserver(([entry]) => {
      inlineInView = entry.isIntersecting;
      popcard.hidden = popcardDismissed || inlineInView;
      popcard.contentWindow?.postMessage({ type: inlineInView ? 'CT_WIV' : 'CT_WOV' }, popcardOrigin);
    }, { threshold: 0.3 }).observe(widget);
  }
  const video = document.getElementById('hero-video');
  const videoToggle = document.getElementById('video-toggle');
  if (window.innerWidth > 760 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData) {
    let userPaused = false;
    video.src = video.dataset.src;
    video.muted = true;
    video.addEventListener('playing', () => { videoToggle.hidden = false; videoToggle.textContent = 'Pause video Ⅱ'; videoToggle.setAttribute('aria-label', 'Pause background video'); });
    video.addEventListener('pause', () => { videoToggle.textContent = 'Play video ▷'; videoToggle.setAttribute('aria-label', 'Play background video'); });
    video.addEventListener('error', () => { videoToggle.hidden = true; });
    videoToggle.addEventListener('click', () => {
      userPaused = !video.paused;
      if (userPaused) video.pause(); else video.play().catch(() => {});
    });
    new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
      else if (!userPaused) video.play().catch(() => {});
    }).observe(video);
  }
})();

// Keep a first-party entry point available even if either remote app fails to boot.
// The real popcard replaces it only after BOTH apps confirm they rendered.
function createCornerChat(widget, popcard, closeButton) {
  const launcher = document.getElementById('chat-fallback');
  const status = document.getElementById('chat-status');
  const statusText = document.getElementById('chat-status-text');
  const recovery = document.getElementById('chat-recovery');
  const retry = document.getElementById('chat-retry');
  const apps = [
    { frame: widget, origin: 'https://connect.campusthreads.co', readyType: 'CT_READY' },
    { frame: popcard, origin: 'https://ct-popcard.web.app', readyType: 'CT_POPCARD_READY' },
  ].map(app => ({ ...app, url: app.frame.src, ready: false, attempts: 0, deadline: Date.now() + 15000 }));
  let open = false;
  let externalOpen = false;
  let stopped = false;
  let timer;
  const render = () => {
    const ready = apps[0].ready;
    // Do not replace a button someone is about to click or has reached by keyboard.
    const enhanced = ready && apps[1].ready && (launcher.hidden || !launcher.matches(':hover, :focus-within'));
    const failed = !ready && ((apps[0].attempts >= 2 && Date.now() >= apps[0].deadline) || !navigator.onLine);
    document.body.dataset.chatState = ready ? 'ready' : failed ? 'unavailable' : 'loading';
    widget.hidden = !open || !ready;
    status.hidden = !open || ready;
    status.setAttribute('aria-busy', String(!failed));
    const message = !navigator.onLine ? 'You’re offline. Reconnect to chat with a resident.'
      : failed ? 'Chat is taking longer to connect. Please try again, or open it in a new tab.'
      : 'Connecting you with The Diamond residents…';
    if (statusText.textContent !== message) statusText.textContent = message;
    recovery.hidden = !failed;
    launcher.hidden = open || enhanced;
    popcard.hidden = !enhanced || (open && externalOpen);
    closeButton.hidden = !open || (enhanced && !externalOpen);
    document.body.classList.toggle('chat-is-open', open);
  };
  const reload = app => {
    if (app.ready) return; // Never interrupt an initialized widget or an active conversation.
    app.attempts += 1;
    app.deadline = Date.now() + 25000;
    const url = new URL(app.url);
    url.searchParams.set('ctRetry', String(Date.now()));
    app.frame.src = url.href;
  };
  const poll = () => {
    if (stopped) return;
    apps.forEach(app => {
      if (app.ready) return;
      app.frame.contentWindow?.postMessage({ type: 'CT_STATUS_REQUEST' }, app.origin);
      if (navigator.onLine && Date.now() >= app.deadline && app.attempts < 2) reload(app);
    });
    render();
    if (navigator.onLine && apps.some(app => !app.ready && (app.attempts < 2 || Date.now() < app.deadline))) timer = setTimeout(poll, 1000);
  };
  const restart = () => {
    clearTimeout(timer);
    apps.forEach(app => {
      if (app.ready) return;
      app.attempts = 0;
      if (navigator.onLine) reload(app);
    });
    poll();
  };
  window.addEventListener('message', event => {
    const app = apps.find(item => event.source === item.frame.contentWindow && event.origin === item.origin);
    if (!app || event.data?.type !== app.readyType || app.ready) return;
    app.ready = true;
    render();
    if (app.frame === widget && open) widget.focus({ preventScroll: true });
  });
  retry.addEventListener('click', restart);
  launcher.addEventListener('pointerleave', render);
  launcher.addEventListener('blur', render);
  window.addEventListener('online', restart);
  window.addEventListener('offline', render);
  // Suspend background work in bfcache and resume without resetting a ready conversation.
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { stopped = false; poll(); }
  });
  poll();
  return {
    setOpen(value, external) {
      open = value;
      externalOpen = external;
      if (!open) popcard.contentWindow?.postMessage({ type: 'CT_HOST_CLOSE' }, apps[1].origin);
      render();
      if (open) (apps[0].ready ? widget : closeButton).focus({ preventScroll: true });
    },
  };
}
