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
  let lastChatTrigger = null;
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
    widget.hidden = !open;
    document.body.classList.toggle('chat-is-open', open);
    popcard.hidden = open && external;
    closeButton.hidden = !(open && external);
    if (open) widget.focus({ preventScroll: true });
    else lastChatTrigger?.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-chat]').forEach(trigger => trigger.addEventListener('click', event => {
    event.preventDefault();
    closeMenu();
    lastChatTrigger = trigger;
    if (mode === 'corner') setChatOpen(true, true);
    else document.getElementById('residents').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }));
  closeButton?.addEventListener('click', () => setChatOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(); menuToggle.focus(); }
    if (chatOpen) setChatOpen(false);
  });
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
    }
    if (type === 'CT_CWOR') setChatOpen(true);
    if (type === 'CT_CWCR') setChatOpen(false);
    if (type === 'CT_CWRZ') resize();
    if (type === 'CT_CLOSE') { setChatOpen(false); popcard.hidden = true; }
  });
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
