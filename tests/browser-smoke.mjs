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
  // The centered scrub gesture is relative to the starting size and recenters without resetting the chosen size.
  await desktop.locator('#brush-size').evaluate(element => { element.value = '10'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const scrub = desktop.locator('#brush-scrub');
  const scrubBox = await scrub.boundingBox();
  assert.ok(scrubBox && scrubBox.width > 100, 'brush size scrubber should have a usable drag target');
  await desktop.mouse.move(scrubBox.x + scrubBox.width / 2, scrubBox.y + scrubBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(scrubBox.x + scrubBox.width / 2 - scrubBox.width * 0.22, scrubBox.y + scrubBox.height / 2, { steps: 5 });
  await desktop.mouse.up();
  const thickerSize = Number(await desktop.locator('#brush-size').inputValue());
  assert.ok(thickerSize > 10, 'dragging left from the scrub center must increase brush size');
  assert.equal(await scrub.evaluate(element => element.classList.contains('is-dragging')), false, 'scrub gesture should recenter on release');
  await desktop.mouse.move(scrubBox.x + scrubBox.width / 2, scrubBox.y + scrubBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(scrubBox.x + scrubBox.width / 2 + scrubBox.width * 0.22, scrubBox.y + scrubBox.height / 2, { steps: 5 });
  await desktop.mouse.up();
  assert.ok(Number(await desktop.locator('#brush-size').inputValue()) < thickerSize, 'dragging right must thin the brush');
  await desktop.locator('#brush-size').evaluate(element => { element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const historyBeforeGrid = await desktop.locator('#undo').isEnabled();
  await desktop.locator('#grid-toggle').click();
  assert.equal(await desktop.locator('#grid-toggle').getAttribute('aria-pressed'), 'true', 'pixel grid toggle must expose its enabled state');
  assert.equal(await desktop.locator('#undo').isEnabled(), historyBeforeGrid, 'view-only grid must not alter artwork history');
  await desktop.locator('#grid-toggle').click();
  assert.equal(await desktop.locator('#grid-toggle').getAttribute('aria-pressed'), 'false', 'pixel grid must be independently hideable');
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'a committed stroke must enable undo');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#redo').isEnabled(), true, 'undo must enable redo');
  await desktop.locator('#redo').click();

  // Geometric tools show a temporary preview, then commit as exactly one undoable pixel action.
  const settledCanvasData = async () => await canvas.evaluate(element => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.toDataURL())))));
  for (const shape of [
    { id: '#line-tool', name: 'line', dx: 52, dy: 31 },
    { id: '#rectangle-tool', name: 'rectangle', dx: 58, dy: 42 },
    { id: '#ellipse-tool', name: 'ellipse', dx: 64, dy: 38 }
  ]) {
    const beforeShape = await settledCanvasData();
    await desktop.locator(shape.id).click();
    const sx = box.x + box.width * 0.42, sy = box.y + box.height * 0.42;
    await desktop.mouse.move(sx, sy);
    await desktop.mouse.down();
    await desktop.mouse.move(sx + shape.dx, sy + shape.dy, { steps: 5 });
    const previewShape = await settledCanvasData();
    assert.notEqual(previewShape, beforeShape, shape.name + ' should display a live preview while dragging');
    await desktop.mouse.up();
    assert.equal(await desktop.locator('#undo').isEnabled(), true, shape.name + ' should commit to history on release');
    await desktop.locator('#undo').click();
    assert.equal(await settledCanvasData(), beforeShape, shape.name + ' should be reverted completely by one undo');
  }
  const beforeCancelledShape = await settledCanvasData();
  await desktop.locator('#line-tool').click();
  const cancelX = box.x + box.width * 0.36, cancelY = box.y + box.height * 0.36;
  await desktop.mouse.move(cancelX, cancelY);
  await desktop.mouse.down();
  await desktop.mouse.move(cancelX + 70, cancelY + 25, { steps: 4 });
  assert.notEqual(await settledCanvasData(), beforeCancelledShape, 'a shape should be visible in the preview before cancellation');
  await desktop.keyboard.press('Escape');
  await desktop.mouse.up();
  assert.equal(await settledCanvasData(), beforeCancelledShape, 'Escape must cancel the preview without changing document pixels');
  await desktop.locator('#brush-tool').click();

  // Bucket fill is wired to the same document/history pipeline as brush strokes.
  await desktop.locator('#color').evaluate(element => {
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await desktop.locator('#fill-tool').click();
  assert.equal(await desktop.locator('#fill-settings').isVisible(), true, 'fill settings should follow the selected tool');
  await desktop.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.waitForFunction(() => /Filled [0-9,]+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'a fill must create one undoable edit');
  await desktop.locator('#undo').click();
  await desktop.locator('#eyedropper-tool').click();
  assert.equal(await desktop.locator('#sample-settings').isVisible(), true, 'eyedropper source settings should follow the selected tool');
  await desktop.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal((await desktop.locator('#color').inputValue()).toUpperCase(), '#DCE2F0', 'eyedropper should restore the sampled foreground color');
  assert.equal(await desktop.locator('#brush-tool').getAttribute('class').then(value => value.includes('active')), true, 'sampling should return to the previous drawing tool');
  await desktop.locator('#color').evaluate(element => {
    element.value = '#DCE2F0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

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
  assert.equal(await desktop.locator('.layer-select').first().textContent(), 'Layer 2');
  await desktop.locator('.layer-row').first().getByRole('button', { name: 'Lower layer' }).click();
  assert.equal(await desktop.locator('.layer-select').first().textContent(), 'Layer 1', 'layer order control should change the stack');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('.layer-select').first().textContent(), 'Layer 2', 'layer reorder should undo with the document history');
  await desktop.locator('#redo').click();
  assert.equal(await desktop.locator('.layer-select').first().textContent(), 'Layer 1', 'layer reorder should redo with the document history');
  await desktop.getByRole('button', { name: 'Lock layer' }).last().click();
  assert.equal(await desktop.getByRole('button', { name: 'Unlock layer' }).count(), 1, 'layer lock should update the layer control');
  assert.equal(await desktop.locator('#draw-hold').isDisabled(), true, 'locked active layer should disable draw-hold input');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.getByRole('button', { name: 'Lock layer' }).count(), 2, 'undo should restore the unlocked layer state');
  assert.equal(await desktop.locator('#draw-hold').isDisabled(), false, 'undo should re-enable drawing on the active layer');
  await desktop.locator('#redo').click();
  assert.equal(await desktop.getByRole('button', { name: 'Unlock layer' }).count(), 1, 'redo should restore the locked layer state');
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

  // Rectangular marquee selection must work with a mouse and clear cleanly on Escape.
  const undoBeforeSelection = await desktop.locator('#undo').isEnabled();
  await desktop.locator('#select-tool').click();
  assert.equal(await desktop.locator('#select-tool').evaluate(element => element.classList.contains('active')), true);
  const selectCanvasBox = await desktop.locator('#canvas').boundingBox();
  assert.ok(selectCanvasBox);
  await desktop.mouse.move(selectCanvasBox.x + selectCanvasBox.width / 2, selectCanvasBox.y + selectCanvasBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(selectCanvasBox.x + selectCanvasBox.width / 2 + 30, selectCanvasBox.y + selectCanvasBox.height / 2 + 24);
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeSelection, 'selection is a non-destructive overlay and must not add history');
  await desktop.locator('#brush-tool').click();

  // Use an isolated context so desktop autosaved state cannot leak into the mobile smoke tests.
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => failures.push(`mobile page error: ${error.message}`));
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => /Ready|Recovered latest local project|Local recovery unavailable/.test(document.querySelector('#status')?.textContent ?? ''));
  await mobile.locator('#layers-tab').click();
  assert.equal(await mobile.locator('.inspector').evaluate(element => element.classList.contains('show-layers')), true, 'mobile Layers tab should switch the compact inspector');
  assert.equal(await mobile.locator('#layers-tab').getAttribute('aria-selected'), 'true');
  await mobile.locator('#properties-tab').click();
  assert.equal(await mobile.locator('.inspector').evaluate(element => element.classList.contains('show-layers')), false, 'mobile Properties tab should restore tool controls');
  const mobileCanvas = mobile.locator('#canvas');
  const mobileBox = await mobileCanvas.boundingBox();
  assert.ok(mobileBox && mobileBox.width > 150 && mobileBox.height > 150, 'mobile canvas must remain usable');
  // The marquee must also be operable with a real touch pointer, without painting.
  await mobile.locator('#select-tool').click();
  const selectionTouchStart = { x: mobileBox.x + mobileBox.width / 2, y: mobileBox.y + mobileBox.height / 2 };
  const selectionCdp = await mobile.context().newCDPSession(mobile);
  await selectionCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [selectionTouchStart] });
  await selectionCdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: selectionTouchStart.x + 24, y: selectionTouchStart.y + 18 }] });
  await selectionCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await mobile.keyboard.press('Escape');
  await mobile.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'mobile selection must not alter document history');


  await mobile.locator('#brush-tool').click();
  assert.equal(await mobile.locator('#draw-hold').isDisabled(), false, 'mobile hold-input tests require the drawing tool on an editable active layer');

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

  const holdBox = await mobile.locator('#draw-hold').boundingBox();
  assert.ok(holdBox);
  await mobile.locator('#draw-hold').focus();
  await mobile.keyboard.down('Space');
  await mobile.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
  await mobile.mouse.down();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true', 'pointer input must not steal keyboard hold ownership');
  await mobile.mouse.up();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true', 'a pointer release must not release a keyboard-owned hold');
  await mobile.keyboard.up('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false');

  await mobile.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
  await mobile.mouse.down();
  await mobile.keyboard.down('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true', 'keyboard input must not steal pointer hold ownership');
  await mobile.keyboard.up('Space');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true');
  await mobile.mouse.up();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false');

  await mobile.locator('#draw-hold').focus();
  await mobile.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
  await mobile.mouse.down();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'true');
  await mobile.locator('#pan-tool').focus();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false', 'pointer-held drawing must cancel when the hold control loses focus');
  await mobile.mouse.up();
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false');

  await mobile.locator('#pan-tool').click();
  await mobile.mouse.move(mobileBox.x + mobileBox.width / 2, mobileBox.y + mobileBox.height / 2);
  await mobile.mouse.down();
  await mobile.mouse.move(mobileBox.x + mobileBox.width / 2 + 18, mobileBox.y + mobileBox.height / 2 + 8);
  await mobile.mouse.up();
  await mobile.locator('#brush-tool').click();
  const cdp = selectionCdp;
  const touchDrag = async (x1, y1, x2, y2) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  // Cursor mode is a global relative touchpad: swiping over UI moves the cursor but never paints.
  await mobile.locator('#cursor-mode').click();
  assert.equal(await mobile.locator('#cursor-mode').getAttribute('aria-pressed'), 'true');
  const undoBeforeCursorSwipe = await mobile.locator('#undo').isEnabled();
  const cursorStart = await mobile.locator('#canvas').boundingBox();
  await touchDrag(cursorStart.x + cursorStart.width * 0.25, cursorStart.y + cursorStart.height * 0.25, cursorStart.x + cursorStart.width * 0.25 + 30, cursorStart.y + cursorStart.height * 0.25 + 14);
  assert.equal(await mobile.locator('#undo').isEnabled(), undoBeforeCursorSwipe, 'swiping anywhere in cursor mode must move the cursor without painting');
  const panButtonBox = await mobile.locator('#pan-tool').boundingBox();
  await touchDrag(panButtonBox.x + panButtonBox.width / 2, panButtonBox.y + panButtonBox.height / 2, panButtonBox.x + panButtonBox.width / 2 + 24, panButtonBox.y + panButtonBox.height / 2 + 12);
  assert.equal(await mobile.locator('#cursor-mode').getAttribute('aria-pressed'), 'true', 'swiping from a toolbar button must not activate that button');
  assert.equal(await mobile.locator('#pan-tool').evaluate(element => element.classList.contains('active')), false, 'cursor-mode swipes must not switch tools');
  await mobile.locator('#brush-scrub').tap();
  assert.equal(await mobile.locator('#undo').isEnabled(), true, 'touching the size gesture bar in cursor mode must draw at the cursor position');
  await mobile.locator('#undo').click();
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'the cursor-mode dab must be one undoable action');
  await mobile.locator('#rectangle-tool').click();
  assert.equal(await mobile.locator('#cursor-mode').getAttribute('aria-pressed'), 'false', 'choosing a geometric tool must leave cursor mode automatically');
  assert.equal(await mobile.locator('#rectangle-tool').evaluate(element => element.classList.contains('active')), true, 'the selected geometric tool must receive input after leaving cursor mode');
  await mobile.locator('#brush-tool').click();
  const startX = mobileBox.x + mobileBox.width / 2, startY = mobileBox.y + mobileBox.height / 2;
  await touchDrag(startX, startY, startX + 18, startY + 8);
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  assert.equal(await mobile.locator('#undo').isEnabled(), true, 'dragging on the canvas with the pencil must draw immediately without a separate hold button');
  await mobile.locator('#undo').click();
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'the direct touch stroke should undo as one action');
  const drawHoldBounds = await mobile.locator('#draw-hold').boundingBox();
  assert.ok(drawHoldBounds && drawHoldBounds.width > 70, 'mobile draw-hold control must be reachable');
  const holdX = drawHoldBounds.x + drawHoldBounds.width / 2, holdY = drawHoldBounds.y + drawHoldBounds.height / 2;

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
  console.log('Browser smoke checks passed: legacy IndexedDB migration; PNG/JPEG/WebP/GIF imports; drawing, undo/redo and layers; transparent PNG export; safe project-copy import; oversized-image rejection; save during stroke; keyboard controls; mobile direct touch drawing, virtual cursor/hold compatibility and cancellation.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
