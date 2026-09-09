const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../assets/diamond/demo.js'), 'utf8');
const controller = source.slice(source.indexOf('function createCornerChat('));
function setup() {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const listeners = {};
  const elements = new Map();
  const element = id => {
    const value = { hidden: false, src: '', attrs: {}, events: {}, messages: [], focus() {}, matches: () => false,
      setAttribute(key, v) { this.attrs[key] = v; },
      addEventListener(key, fn) { this.events[key] = fn; } };
    value.contentWindow = { postMessage: (...args) => value.messages.push(args) };
    elements.set(id, value);
    return value;
  };
  ['chat-fallback', 'chat-status', 'chat-status-text', 'chat-recovery', 'chat-retry'].forEach(element);
  const widget = element('widget');
  widget.src = 'https://connect.campusthreads.co/diamond-rentals-demo?embedded=true&conjoined=true';
  const popcard = element('popcard');
  popcard.src = 'https://ct-popcard.web.app/diamond-rentals-demo?conjoined=true';
  const close = element('close');
  const document = { body: { dataset: {}, classList: { toggle() {} } }, getElementById: id => elements.get(id) };
  const navigator = { onLine: true };
  const window = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const context = { document, window, navigator, URL, Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; },
    clearTimeout: id => timers.delete(id) };
  runInNewContext(controller, context);
  const chat = context.createCornerChat(widget, popcard, close);
  const emit = (type, event = {}) => (listeners[type] || []).forEach(fn => fn(event));
  const ready = (frame, type, origin = new URL(frame.src).origin) => emit('message', { source: frame.contentWindow, origin, data: { type } });
  const tick = duration => {
    const end = now + duration;
    while (timers.size) {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (timer.at > end) break;
      now = timer.at;
      timers.delete(id);
      timer.fn();
    }
    now = end;
  };
  return { chat, widget, popcard, close, elements, document, navigator, timers, ready, tick, emit };
}

test('a visible direct chat link exists even without JavaScript', () => {
  const html = readFileSync(join(__dirname, '../branded-corner/diamond-rentals-demo/index.html'), 'utf8');
  const anchor = html.match(/<a id="chat-fallback"[^>]+>/)[0];
  assert.match(anchor, /href="https:\/\/connect.campusthreads.co\/diamond-rentals-demo"/);
  assert.doesNotMatch(anchor, /hidden/);
  assert.match(html, /<iframe id="ct-popcard" hidden/);
});

test('startup has one visible launcher, and opening it never exposes a blank iframe', () => {
  const s = setup();
  assert.equal(s.elements.get('chat-fallback').hidden, false);
  assert.equal(s.popcard.hidden, true);
  s.chat.setOpen(true, true);
  assert.equal(s.widget.hidden, true);
  assert.equal(s.elements.get('chat-status').hidden, false);
  assert.equal(s.close.hidden, false);
  s.chat.setOpen(false);
  assert.equal(s.elements.get('chat-status').hidden, true);
  assert.equal(s.elements.get('chat-fallback').hidden, false);
});

test('blocked apps retry twice, then offer recovery without disappearing or looping', () => {
  const s = setup();
  const initial = s.widget.src;
  s.tick(15000);
  const firstRetry = s.widget.src;
  assert.notEqual(firstRetry, initial);
  s.tick(25000);
  assert.notEqual(s.widget.src, firstRetry);
  s.chat.setOpen(true, true);
  assert.equal(s.elements.get('chat-recovery').hidden, true);
  s.tick(25000);
  assert.equal(s.document.body.dataset.chatState, 'unavailable');
  assert.equal(s.elements.get('chat-recovery').hidden, false);
  assert.equal(s.widget.hidden, true);
  assert.equal(s.timers.size, 0);
  const lastRetry = s.widget.src;
  s.tick(60000);
  assert.equal(s.widget.src, lastRetry);
  s.elements.get('chat-retry').events.click();
  assert.notEqual(s.widget.src, lastRetry);
  s.ready(s.widget, 'CT_READY');
  assert.equal(s.widget.hidden, false);
  assert.equal(s.elements.get('chat-status').hidden, true);
});

test('a failed popcard cannot hide a working chat, and retries never reload it', () => {
  const s = setup();
  s.ready(s.widget, 'CT_READY');
  const initialized = s.widget.src;
  s.chat.setOpen(true, true);
  s.tick(90000);
  assert.equal(s.widget.hidden, false);
  assert.equal(s.widget.src, initialized);
  s.chat.setOpen(false);
  assert.equal(s.elements.get('chat-fallback').hidden, false);
  s.ready(s.popcard, 'CT_POPCARD_READY');
  assert.equal(s.popcard.hidden, false);
  assert.equal(s.elements.get('chat-fallback').hidden, true);
});

test('late readiness is polled, untrusted messages ignored, and active UI never swapped', () => {
  const s = setup();
  s.tick(3000);
  assert.equal(s.widget.messages.length, 4);
  s.ready(s.widget, 'CT_READY', 'https://wrong.example');
  s.ready(s.popcard, 'CT_READY');
  assert.equal(s.document.body.dataset.chatState, 'loading');
  s.chat.setOpen(true, true);
  s.ready(s.widget, 'CT_READY');
  s.ready(s.popcard, 'CT_POPCARD_READY');
  assert.equal(s.popcard.hidden, true);
  assert.equal(s.close.hidden, false);
  s.tick(90000);
  assert.equal(s.widget.src.includes('ctRetry'), false);
  s.chat.setOpen(false);
  assert.equal(s.popcard.hidden, false);
  assert.equal(s.popcard.messages.at(-1)[0].type, 'CT_HOST_CLOSE');
});

test('offline startup recovers on reconnect and bfcache preserves ready conversations', () => {
  const s = setup();
  s.navigator.onLine = false;
  s.emit('offline');
  s.tick(90000);
  assert.equal(s.widget.src.includes('ctRetry'), false);
  assert.equal(s.document.body.dataset.chatState, 'unavailable');
  s.navigator.onLine = true;
  s.emit('online');
  assert.equal(s.widget.src.includes('ctRetry'), true);
  s.ready(s.widget, 'CT_READY');
  const initialized = s.widget.src;
  s.emit('pagehide');
  s.tick(60000);
  assert.equal(s.timers.size, 0);
  s.emit('pageshow', { persisted: true });
  s.tick(90000);
  assert.equal(s.widget.src, initialized);
});
