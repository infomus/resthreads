// Run after serving the built widget on :3015 and popcard on :3016.
// These use production APIs but serve the three frontends from local files/builds.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = 'https://resthreads.com/branded-corner/diamond-rentals-demo';
const root = new URL('../', import.meta.url);
const live = process.env.LIVE === '1';
const browser = await chromium.launch();
async function scenario(name, options, check) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, javaScriptEnabled: !options.noJS });
  const page = await context.newPage();
  if (options.clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let blockWidget = !!options.blockWidget;
  let widgetDocuments = 0;
  await context.route('https://resthreads.com/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (live) {
      if (options.delayHost && path.endsWith('demo.js')) {
        const response = await route.fetch();
        await new Promise(resolve => setTimeout(resolve, 4000));
        return route.fulfill({ response });
      }
      return route.continue();
    }
    let file = path === '/branded-corner/diamond-rentals-demo' ? `${path}/index.html` : path;
    if (file === '/favicon.ico') return route.fulfill({ status: 204 });
    try {
      const body = await readFile(fileURLToPath(new URL(file.slice(1), root)));
      if (options.delayHost && path.endsWith('demo.js')) await new Promise(resolve => setTimeout(resolve, 4000));
      const ext = file.split('.').pop();
      await route.fulfill({ body, contentType: ({ html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', jpg: 'image/jpeg', png: 'image/png' })[ext] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404 }); }
  });
  for (const [origin, port] of [['https://connect.campusthreads.co', 3015], ['https://ct-popcard.web.app', 3016]]) {
    await context.route(`${origin}/**`, async route => {
      const widget = port === 3015;
      if (widget && route.request().isNavigationRequest()) widgetDocuments++;
      if ((widget && blockWidget) || (!widget && options.blockPopcard)) return route.abort();
      if (live) return route.continue();
      const url = new URL(route.request().url());
      try {
        const response = await context.request.get(`http://localhost:${port}${url.pathname}${url.search}`);
        await route.fulfill({ response });
      } catch { await route.abort(); }
    });
  }
  // Lose readiness notifications until the host explicitly queries the loaded app.
  if (options.loseReady) await context.addInitScript(() => {
    if (location.origin !== 'https://resthreads.com') return;
    const queried = new Set();
    window.addEventListener('message', event => {
      if (!['CT_READY', 'CT_POPCARD_READY'].includes(event.data?.type)) return;
      if (queried.has(event.data.type)) return;
      queried.add(event.data.type);
      event.stopImmediatePropagation();
    });
  });
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await check({ page, context, unblock: () => { blockWidget = false; }, documents: () => widgetDocuments });
    assert.deepEqual(errors, [], `${name}: browser errors`);
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log('FAIL', name, await page.locator('body').getAttribute('data-chat-state'));
    const frame = await widgetFrame(page);
    console.log('Widget state', await frame?.evaluate(() => ({ text: document.body.innerText.slice(0, 1800), style: getComputedStyle(document.body).cssText, html: document.body.outerHTML.slice(0, 1000) })).catch(() => null));
    await page.screenshot({ path: '/tmp/diamond-resilience-failure.png' });
    throw error;
  } finally { await context.close(); }
}
const widgetFrame = async page => (await page.locator('#ct-widget').elementHandle()).contentFrame();
const waitReady = page => page.waitForFunction(() => document.body.dataset.chatState === 'ready', null, { timeout: 45000 });
try {
  await scenario('normal cold load, repeat open/close', {}, async ({ page, documents }) => {
    await waitReady(page);
    await page.locator('#ct-popcard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#chat-fallback').isVisible(), false);
    const initial = documents();
    await page.locator('.residents-button').click();
    const frame = await widgetFrame(page);
    await frame.getByText('Chat with our Residents', { exact: true }).waitFor();
    assert.equal(await page.locator('#chat-status').isVisible(), false);
    await page.locator('#chat-close').click();
    await page.locator('.residents-button').click();
    assert.equal(await page.locator('#ct-widget').isVisible(), true);
    assert.equal(documents(), initial);
    await page.waitForTimeout(500); // Allow the child frame's first visible paint before capturing.
    await page.screenshot({ path: '/tmp/diamond-resilient-desktop.png' });
  });
  await scenario('mobile with popcard permanently blocked', { mobile: true, blockPopcard: true }, async ({ page }) => {
    await waitReady(page);
    await page.locator('#chat-fallback').click();
    assert.equal(await page.locator('#ct-widget').isVisible(), true);
    const bounds = await page.locator('#ct-widget').boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    const frame = await widgetFrame(page);
    await frame.getByText('Chat with our Residents', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/diamond-resilient-mobile.png' });
    await page.locator('#chat-close').click();
    assert.equal(await page.locator('#chat-fallback').isVisible(), true);
  });
  await scenario('blocked startup recovers automatically', { blockWidget: true }, async ({ page, unblock, documents }) => {
    await page.locator('#chat-fallback').click();
    assert.equal(await page.locator('#ct-widget').isVisible(), false);
    assert.equal(await page.locator('#chat-status').isVisible(), true);
    await page.screenshot({ path: '/tmp/diamond-resilient-loading.png' });
    unblock();
    await waitReady(page);
    assert.ok(documents() >= 2);
    assert.equal(await page.locator('#ct-widget').isVisible(), true);
    assert.equal(await page.locator('#chat-status').isVisible(), false);
  });
  await scenario('lost initial readiness messages', { loseReady: true }, async ({ page, documents }) => {
    await waitReady(page);
    await page.locator('#ct-popcard').waitFor({ state: 'visible' });
    assert.equal(documents(), 1, 'readiness probing should recover without reloading');
  });
  await scenario('delayed host listener', { delayHost: true }, async ({ page }) => {
    await waitReady(page);
    await page.locator('#ct-popcard').waitFor({ state: 'visible' });
  });
  await scenario('permanent failure remains usable and manual retry recovers', { mobile: true, blockWidget: true, blockPopcard: true, clock: true }, async ({ page, unblock, documents }) => {
    await page.locator('#chat-fallback').click();
    for (const ms of [16000, 26000, 26000]) await page.clock.fastForward(ms);
    await page.locator('#chat-retry').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ct-widget').isVisible(), false);
    assert.equal(await page.locator('.chat-direct').isVisible(), true);
    await page.screenshot({ path: '/tmp/diamond-resilient-retry.png' });
    const attempts = documents();
    await page.clock.fastForward(120000);
    assert.equal(documents(), attempts);
    await page.clock.resume();
    unblock();
    await page.locator('#chat-retry').click();
    await waitReady(page);
    assert.equal(await page.locator('#ct-widget').isVisible(), true);
  });
  await scenario('JavaScript unavailable', { noJS: true, blockWidget: true, blockPopcard: true }, async ({ page }) => {
    assert.equal(await page.locator('#chat-fallback').isVisible(), true);
    assert.equal(await page.locator('#chat-fallback').getAttribute('href'), 'https://connect.campusthreads.co/diamond-rentals-demo');
  });
} finally { await browser.close(); }
