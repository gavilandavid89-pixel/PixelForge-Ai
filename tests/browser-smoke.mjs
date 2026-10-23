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
  const migrationContext = await browser.newContext();
  const migrationPage = await migrationContext.newPage();
  migrationPage.on('pageerror', error => failures.push(`migration page error: ${error.message}`));
  await migrationPage.goto('http://127.0.0.1:4173/tests/fixtures/blank.html');
  await migrationPage.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('pixelforge-ai', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({
        id: 'legacy-project', name: 'Legacy Project', updatedAt: 1,
        project: { format: 'pixelforge-project', version: 1, id: 'legacy-project', name: 'Legacy Project', width: 2, height: 2, activeLayerId: 'legacy-layer', revision: 0, saveVersion: 0,
          layers: [{ id: 'legacy-layer', name: 'Legacy', visible: true, opacity: 1, locked: false, pixels: 'AAAAAAAAAAAAAAAAAAAAAA==' }] }
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await migrationPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await migrationPage.waitForFunction(() => /Recovered latest local project/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await migrationPage.locator('#document-name').textContent(), 'Legacy Project', 'version-1 local projects must survive the version-2 metadata migration');
  await migrationPage.locator('#projects-button').click();
  await migrationPage.waitForFunction(() => document.querySelector('#projects-dialog')?.open === true);
  assert.equal(await migrationPage.locator('#projects-list .saved-project-open').count(), 1, 'migrated project metadata must appear in the local library');
  await migrationPage.locator('#close-projects').click();
  await migrationContext.close();

  const imageContext = await browser.newContext();
  const imagePage = await imageContext.newPage();
  imagePage.on('pageerror', error => failures.push(`image import page error: ${error.message}`));
  await imagePage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await imagePage.waitForFunction(() => /Ready|Recovered latest local project|Local recovery unavailable/.test(document.querySelector('#status')?.textContent ?? ''));
  const generatedImages = await imagePage.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 3; canvas.height = 2;
    const context = canvas.getContext('2d'); context.fillStyle = '#e34b68'; context.fillRect(0, 0, 1, 2);
    const encode = async type => {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type));
      if (!blob) throw new Error(`Browser cannot encode ${type}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    };
    return { png: await encode('image/png'), jpeg: await encode('image/jpeg'), webp: await encode('image/webp') };
  });
  const importImage = async (name, mimeType, buffer, dimensions) => {
    const expectedName = name.slice(0, name.lastIndexOf('.'));
    await imagePage.locator('#import-file').setInputFiles({ name, mimeType, buffer });
    await imagePage.waitForFunction(expected => /Import complete and saved locally/.test(document.querySelector('#status')?.textContent ?? '') && document.querySelector('#document-name')?.textContent === expected, expectedName);
    assert.equal(await imagePage.locator('#document-size').textContent(), dimensions, `${name} should decode at the verified dimensions`);
  };
  await importImage('valid-png.png', 'image/png', Buffer.from(generatedImages.png, 'base64'), '3 × 2');
  await importImage('valid-jpeg.jpg', 'image/jpeg', Buffer.from(generatedImages.jpeg, 'base64'), '3 × 2');
  await importImage('valid-webp.webp', 'image/webp', Buffer.from(generatedImages.webp, 'base64'), '3 × 2');
  await importImage('valid-gif.gif', 'image/gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'), '1 × 1');
  await imageContext.close();

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

  await desktop.locator('#eraser-tool').focus();
  await desktop.keyboard.press('Space');
  assert.match(await desktop.locator('#eraser-tool').getAttribute('class'), /active/, 'Space must activate a focused tool button instead of being swallowed by the pan shortcut');
  await desktop.locator('#brush-tool').click();
  // Ctrl/Cmd+S during a live pointer stroke must commit it before saving.
  const saveStrokeStartX = box.x + box.width / 2 + 36, saveStrokeStartY = box.y + box.height / 2 + 20;
  await desktop.mouse.move(saveStrokeStartX, saveStrokeStartY);
  await desktop.mouse.down();
  await desktop.mouse.move(saveStrokeStartX + 18, saveStrokeStartY + 8, { steps: 3 });
  await desktop.keyboard.press('Control+s');
  await desktop.waitForFunction(() => /Saved on this device/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.mouse.up();
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'saving during a stroke must commit that stroke as one history action');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#undo').isEnabled(), false, 'both strokes should be individually undoable');
  await desktop.locator('#redo').click();
  await desktop.locator('#redo').click();
  assert.equal(await desktop.locator('#redo').isEnabled(), false);

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
  const alphaCheck = await desktop.evaluate(async base64 => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height;
    const context = probe.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return { cornerAlpha: context.getImageData(0, 0, 1, 1).data[3], centerAlpha: context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data[3] };
  }, pngHeader.toString('base64'));
  assert.equal(alphaCheck.cornerAlpha, 0, 'PNG export must preserve transparent background pixels');
  assert.equal(alphaCheck.centerAlpha, 255, 'drawn pixels must remain opaque in PNG export');

  const projectDownloadPromise = desktop.waitForEvent('download');
  await desktop.locator('#export-project').click();
  const projectDownload = await projectDownloadPromise;
  assert.ok(projectDownload.suggestedFilename().toLowerCase().endsWith('.pforge'));
  const projectPath = await projectDownload.path();
  const projectText = await readFile(projectPath, 'utf8');
  const exportedProject = JSON.parse(projectText);
  const originalLayerIds = exportedProject.layers.map(layer => layer.id);
  await desktop.locator('#import-file').setInputFiles({ name: projectDownload.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(projectText) });
  await desktop.waitForFunction(() => /Import complete and saved locally/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.match(await desktop.locator('#document-name').textContent(), /\(imported\)$/);
  const storedProjects = await desktop.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('pixelforge-ai');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readonly');
      const getAll = tx.objectStore('documents').getAll();
      getAll.onsuccess = () => { resolve(getAll.result.map(item => ({ id: item.id, name: item.name, layerIds: item.project.layers.map(layer => layer.id) }))); db.close(); };
      getAll.onerror = () => { db.close(); reject(getAll.error); };
    };
  }));
  const originalRecord = storedProjects.find(item => item.id === exportedProject.id);
  const importedRecord = storedProjects.find(item => item.name.endsWith('(imported)'));
  assert.ok(originalRecord, 'import must not overwrite the previously saved project');
  assert.ok(importedRecord, 'imported copy must be stored independently');
  assert.notEqual(importedRecord.id, originalRecord.id);
  assert.notDeepEqual(importedRecord.layerIds, originalLayerIds, 'imported layers must receive new IDs');
  assert.equal(storedProjects.length, 2, 'the source project and imported copy should both remain stored');
  await desktop.locator('#projects-button').click();
  await desktop.waitForFunction(() => document.querySelector('#projects-dialog')?.open === true);
  assert.equal(await desktop.locator('#projects-dialog').evaluate(element => element.open), true);
  const projectRows = desktop.locator('#projects-list .saved-project-open');
  assert.equal(await projectRows.count(), 2, 'the local project library must list both saved projects');
  const projectNames = await projectRows.allTextContents();
  assert.ok(projectNames.some(name => name.includes('(imported)')));
  assert.ok(projectNames.some(name => name.includes(exportedProject.name)));
  const sourceSelector = '#projects-list .saved-project-open[data-project-id="' + originalRecord.id + '"]';
  await desktop.locator(sourceSelector).click();
  await desktop.waitForFunction(name => document.querySelector('#document-name')?.textContent === name, exportedProject.name);
  await desktop.locator('#projects-button').click();
  const importedSelector = '#projects-list .saved-project-open[data-project-id="' + importedRecord.id + '"]';
  await desktop.locator(importedSelector).click();
  await desktop.waitForFunction(() => /\(imported\)$/.test(document.querySelector('#document-name')?.textContent ?? ''));

  const oversizedPng = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedPng, 0);
  oversizedPng.writeUInt32BE(13, 8); oversizedPng.write('IHDR', 12, 'ascii');
  oversizedPng.writeUInt32BE(2049, 16); oversizedPng.writeUInt32BE(1, 20);
  await desktop.locator('#import-file').setInputFiles({ name: 'oversized.png', mimeType: 'image/png', buffer: oversizedPng });
  await desktop.waitForFunction(() => /Import failed:.*safe limit/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.match(await desktop.locator('#document-name').textContent(), /\(imported\)$/ , 'a rejected image must not replace the current project');

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
  await mobile.locator('#draw-hold').focus();
  await mobile.keyboard.down('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true', 'keyboard hold must enter the pressed state on the mobile workspace');
  await mobile.keyboard.up('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false', 'keyboard hold must release deterministically');
  await mobile.keyboard.down('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true');
  await mobile.locator('#pan-tool').focus();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false', 'leaving the hold control must cancel a held keyboard gesture');
  await mobile.keyboard.up('Space');
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

  // Releasing the hold while the cursor finger remains down must stop drawing immediately.
  await mobile.mouse.move(holdX, holdY);
  await mobile.mouse.down();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: startX + 18, y: startY + 8 }] });
  await mobile.mouse.up();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: startX + 28, y: startY + 14 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  await mobile.locator('#undo').click();
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'release must stop drawing without leaving a second history action');

  // Also exercise the real two-touch pattern: one touch holds the control, the other moves the cursor.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: holdX, y: holdY }, { id: 4, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: holdX, y: holdY }, { id: 4, x: startX + 18, y: startY + 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  assert.equal(await mobile.locator('#undo').isEnabled(), true, 'two-touch hold-to-draw must create an undoable stroke');
  await mobile.locator('#undo').click();
  assert.equal(await mobile.locator('#undo').isEnabled(), false);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 5, x: holdX, y: holdY }, { id: 6, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 5, x: holdX, y: holdY }, { id: 6, x: startX + 18, y: startY + 8 }] });
  await mobile.keyboard.press('Escape');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'Escape must cancel an in-progress touch stroke without history');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false', 'Escape must release the draw-hold state');
  assert.deepEqual(failures, [], 'no uncaught browser JavaScript errors should occur');
  console.log('Browser smoke checks passed: startup, drawing, undo/redo, layers, PNG export, safe project-copy import, IndexedDB recovery and mobile touch.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
