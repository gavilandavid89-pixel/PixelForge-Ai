import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(filename);
    res.writeHead(200, { 'content-type': mime[path.extname(filename)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));

let browser;
const failures = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  desktop.on('pageerror', error => failures.push(`desktop page error: ${error.message}`));
  await desktop.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await desktop.locator('#status').waitFor();
  await desktop.waitForFunction(() => /Ready|Recovered latest local project|Local recovery unavailable/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.title(), 'PixelForge AI · Studio');

  const canvas = desktop.locator('#canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 200 && box.height > 200, 'desktop canvas should have a useful drawing area');
  const before = await canvas.evaluate(element => element.toDataURL());
  await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 5 });
  await desktop.mouse.up();
  await canvas.evaluate(element => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await canvas.evaluate(element => element.toDataURL());
  assert.notEqual(after, before, 'drawing must change rendered artwork');
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'a committed stroke must enable undo');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#redo').isEnabled(), true, 'undo must enable redo');
  await desktop.locator('#redo').click();

  await desktop.locator('#add-layer').click();
  assert.match(await desktop.locator('#layer-count').textContent(), /2 layers/);
  await desktop.keyboard.press('Control+s');
  await desktop.waitForFunction(() => /Saved on this device/.test(document.querySelector('#status')?.textContent ?? ''));
  const downloadPromise = desktop.waitForEvent('download');
  await desktop.locator('#export-png').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.png$/i);
  const exportedPath = await download.path();
  const pngHeader = await readFile(exportedPath);
  assert.deepEqual([...pngHeader.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'export must be a real PNG file');

  await desktop.waitForTimeout(1000);
  await desktop.reload({ waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => /Recovered latest local project/.test(document.querySelector('#status')?.textContent ?? ''), null, { timeout: 5000 });
  assert.equal(await desktop.locator('#layer-count').textContent(), '2 layers', 'IndexedDB recovery must preserve document layers');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  mobile.on('pageerror', error => failures.push(`mobile page error: ${error.message}`));
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => /Ready|Recovered latest local project|Local recovery unavailable/.test(document.querySelector('#status')?.textContent ?? ''));
  const mobileCanvas = mobile.locator('#canvas');
  const mobileBox = await mobileCanvas.boundingBox();
  assert.ok(mobileBox && mobileBox.width > 150 && mobileBox.height > 150, 'mobile canvas must remain usable');
  await mobile.locator('#pan-tool').click();
  await mobile.mouse.move(mobileBox.x + mobileBox.width / 2, mobileBox.y + mobileBox.height / 2);
  await mobile.mouse.down();
  await mobile.mouse.move(mobileBox.x + mobileBox.width / 2 + 18, mobileBox.y + mobileBox.height / 2 + 8);
  await mobile.mouse.up();
  await mobile.locator('#brush-tool').click();
  const cdp = await mobile.context().newCDPSession(mobile);
  const touchDrag = async (x1, y1, x2, y2) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const startX = mobileBox.x + mobileBox.width / 2, startY = mobileBox.y + mobileBox.height / 2;
  await touchDrag(startX, startY, startX + 18, startY + 8);
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'touch cursor movement without the hold control must not paint');
  const holdBox = await mobile.locator('#draw-hold').boundingBox();
  assert.ok(holdBox && holdBox.width > 70, 'mobile draw-hold control must be reachable');
  const holdX = holdBox.x + holdBox.width / 2, holdY = holdBox.y + holdBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: holdX, y: holdY }, { id: 2, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: holdX, y: holdY }, { id: 2, x: startX + 18, y: startY + 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 1, x: holdX, y: holdY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  assert.equal(await mobile.locator('#undo').isEnabled(), true, 'holding the draw control while moving a finger must create an undoable stroke');
  assert.deepEqual(failures, [], 'no uncaught browser JavaScript errors should occur');
  console.log('Browser smoke checks passed: startup, drawing, undo/redo, layers, PNG export, IndexedDB recovery and mobile touch.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
