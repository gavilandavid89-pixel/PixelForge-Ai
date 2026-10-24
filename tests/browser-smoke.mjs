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

  // The isolated AI workspace renders its own pixel buffer and reports the real provider state.
  await desktop.locator('#ai-tab').click();
  await desktop.waitForFunction(() => {
    const dimensions = (document.querySelector('#document-size')?.textContent ?? '').split(' × ').map(Number);
    const preview = document.querySelector('#ai-preview-canvas');
    return dimensions.length === 2 && preview?.width === dimensions[0] && preview?.height === dimensions[1];
  });
  assert.ok((await desktop.locator('#ai-connection-state').textContent()).includes('No provider configured'), 'the UI must not claim an AI model is connected');
  assert.equal(await desktop.locator('#ai-generate-proposal').isDisabled(), true, 'proposal generation must stay disabled until a provider is configured');
  assert.equal(await desktop.locator('#ai-send-artwork').isChecked(), false, 'sending artwork must require explicit consent');
  await desktop.locator('#ai-preview-mode').selectOption('changes');
  await desktop.waitForFunction(() => document.querySelector('#ai-diff-count')?.textContent === '0 changed pixels');
  await desktop.locator('#ai-preview-mode').selectOption('original');
  await desktop.locator('#ai-preview-mode').selectOption('ai');
  await desktop.locator('#ai-sync').click();
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'AI canvas synchronized from the original');
  await desktop.locator('#properties-tab').click();
  assert.equal(await desktop.evaluate(() => window.scrollY), 0, 'inspector tabs must not scroll the whole page away from the canvas');

  const canvas = desktop.locator('#canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 200 && box.height > 200 && box.height < 960, 'desktop canvas should fit inside the viewport and remain drawable');
  const before = await canvas.evaluate(element => element.toDataURL());
  await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 5 });
  await desktop.mouse.up();
  await canvas.evaluate(element => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await canvas.evaluate(element => element.toDataURL());
  const undoAfterStroke = await desktop.locator('#undo').isEnabled();
  const strokeStatus = await desktop.locator('#status').textContent();
  assert.notEqual(after, before, 'drawing must change rendered artwork (undo=' + undoAfterStroke + ', status=' + strokeStatus + ', canvasBox=' + JSON.stringify(box) + ')');
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

  // Multi-part symmetry mirrors one gesture and keeps every reflected copy in one undo transaction.
  await desktop.locator('#symmetry-mode').selectOption('4');
  assert.match(await desktop.locator('#status').textContent(), /Symmetry enabled: 4 parts/);
  const symmetryBefore = await settledCanvasData();
  await desktop.locator('#brush-tool').click();
  const symBox = await desktop.locator('#canvas').boundingBox();
  const symX = symBox.x + symBox.width * 0.34, symY = symBox.y + symBox.height * 0.42;
  await desktop.mouse.move(symX, symY);
  await desktop.mouse.down();
  await desktop.mouse.move(symX + 28, symY + 16, { steps: 4 });
  await desktop.mouse.up();
  const symmetryAfter = await settledCanvasData();
  assert.notEqual(symmetryAfter, symmetryBefore, 'symmetry drawing should change the artwork');
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'a symmetric gesture should be undoable');
  await desktop.locator('#undo').click();
  assert.equal(await settledCanvasData(), symmetryBefore, 'all reflected copies must be reverted by one undo');
  await desktop.locator('#symmetry-mode').selectOption('8');
  assert.match(await desktop.locator('#status').textContent(), /Symmetry enabled: 8 parts/);
  await desktop.locator('#symmetry-mode').selectOption('0');
  assert.match(await desktop.locator('#status').textContent(), /Symmetry disabled/);

  // Bucket fill is wired to the same document/history pipeline as brush strokes.
  await desktop.locator('#color').evaluate(element => {
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await desktop.locator('#fill-tool').click();
  assert.equal(await desktop.locator('#fill-settings').isVisible(), true, 'fill settings should follow the selected tool');
  await desktop.locator('#fill-pattern').selectOption('checker');
  await desktop.locator('#fill-scale').evaluate(element => { element.value = '2'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await desktop.locator('#fill-scale-value').textContent(), '2 px', 'dither scale should update from its slider');
  await desktop.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.waitForFunction(() => /Filled [0-9,]+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'a fill must create one undoable edit');
  await desktop.locator('#undo').click();
  await desktop.locator('#fill-pattern').selectOption('solid');
  await desktop.locator('#fill-scale').evaluate(element => { element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await desktop.locator('#eyedropper-tool').click();
  assert.equal(await desktop.locator('#sample-settings').isVisible(), true, 'eyedropper source settings should follow the selected tool');
  await desktop.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal((await desktop.locator('#color').inputValue()).toUpperCase(), '#DCE2F0', 'eyedropper should restore the sampled foreground color');
  assert.equal(await desktop.locator('#brush-tool').getAttribute('class').then(value => value.includes('active')), true, 'sampling should return to the previous drawing tool');
  await desktop.locator('#color').evaluate(element => {
    element.value = '#DCE2F0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await desktop.locator('#brush-opacity').evaluate(element => { element.value = '50'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await desktop.locator('#brush-opacity-value').textContent(), '50%', 'brush opacity slider should update its displayed value');
  await desktop.locator('#brush-opacity').evaluate(element => { element.value = '100'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await desktop.locator('#brush-shape').selectOption('circle');
  await desktop.locator('#brush-hardness').evaluate(element => { element.value = '25'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await desktop.locator('#brush-hardness-value').textContent(), '25%', 'brush hardness slider should update its value');
  await desktop.locator('#brush-shape').selectOption('square');
  await desktop.locator('#brush-hardness').evaluate(element => { element.value = '100'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  // Foreground/background swap and recent colors are real controls, not decorative UI.
  const foregroundBeforeSwap = (await desktop.locator('#color').inputValue()).toUpperCase();
  const backgroundBeforeSwap = await desktop.locator('#background-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  await desktop.locator('#swap-colors').click();
  assert.equal((await desktop.locator('#color').inputValue()).toUpperCase(), '#242632');
  assert.notEqual(await desktop.locator('#background-swatch').evaluate(element => getComputedStyle(element).backgroundColor), backgroundBeforeSwap, 'background swatch should reflect the first swap');
  assert.equal(await desktop.locator('#recent-colors button').count() > 0, true, 'recent color history should expose selectable swatches');
  await desktop.locator('#swap-colors').click();
  assert.equal((await desktop.locator('#color').inputValue()).toUpperCase(), foregroundBeforeSwap, 'swapping twice should restore the original foreground');
  assert.equal(await desktop.locator('#background-swatch').evaluate(element => getComputedStyle(element).backgroundColor), backgroundBeforeSwap, 'swapping twice should restore the original background');

  // User palettes are editable, parse GPL RGB lines, and export a valid GPL download.
  const paletteCountBefore = await desktop.locator('#user-palette .palette-item').count();
  await desktop.locator('#palette-add').click();
  assert.equal(await desktop.locator('#user-palette .palette-item').count(), paletteCountBefore + 1);
  await desktop.locator('#palette-file').setInputFiles({
    name: 'smoke.gpl', mimeType: 'text/plain',
    buffer: Buffer.from('GIMP Palette\nName: smoke\nColumns: 2\n#\n255 0 0 Red\n0 255 0 Green\n')
  });
  await desktop.waitForFunction(() => /Imported 2 palette colors/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.ok(await desktop.locator('#user-palette .palette-item').count() >= paletteCountBefore + 3, 'palette import should add unique parsed colors');
  const paletteDownloadPromise = desktop.waitForEvent('download');
  await desktop.locator('#palette-export').click();
  const paletteDownload = await paletteDownloadPromise;
  assert.equal(paletteDownload.suggestedFilename(), 'pixelforge-palette.gpl');

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
  await desktop.getByRole('button', { name: 'Unlock layer' }).click();
  await desktop.locator('#layer-opacity').evaluate(element => {
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await desktop.locator('#layer-opacity-value').textContent(), '50%');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#layer-opacity-value').textContent(), '100%', 'opacity change should undo');
  await desktop.locator('#duplicate-layer').click();
  assert.equal(await desktop.locator('#layer-count').textContent(), '3 layers', 'duplicate should create a new layer');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#layer-count').textContent(), '2 layers', 'duplicate should undo cleanly');
  desktop.once('dialog', dialog => dialog.accept());
  await desktop.locator('#delete-layer').click();
  assert.equal(await desktop.locator('#layer-count').textContent(), '1 layer', 'delete should remove the active layer');
  await desktop.locator('#undo').click();
  assert.equal(await desktop.locator('#layer-count').textContent(), '2 layers', 'deleted layer should be restored by undo');
  await desktop.keyboard.press('Control+s');
  await desktop.waitForFunction(() => /Saved on this device/.test(document.querySelector('#status')?.textContent ?? ''));
  const downloadPromise = desktop.waitForEvent('download');
  await desktop.locator('#export-png').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.png$/i);
  const sheetDownloads = [];
  const onSheetDownload = item => sheetDownloads.push(item.suggestedFilename());
  desktop.on('download', onSheetDownload);
  await desktop.locator('#export-sprite-sheet').click();
  await desktop.waitForFunction(() => /Sprite sheet exported:/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.waitForTimeout(100);
  desktop.off('download', onSheetDownload);
  assert.ok(sheetDownloads.some(name => name.endsWith('-spritesheet.png')), 'sprite sheet export must produce a PNG');
  assert.ok(sheetDownloads.some(name => name.endsWith('-spritesheet.json')), 'sprite sheet export must produce frame metadata');
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
  assert.ok(await desktop.locator('#user-palette .palette-item').count() >= 3, 'local palette colors should persist across page reloads');

  // Freehand lasso selection records a polygon mask without changing artwork history.
  const undoBeforeLassoSelection = await desktop.locator('#undo').isEnabled();
  await desktop.locator('#lasso-select-tool').click();
  assert.equal(await desktop.locator('#lasso-select-tool').evaluate(element => element.classList.contains('active')), true);
  const lassoCanvasBox = await desktop.locator('#canvas').boundingBox();
  assert.ok(lassoCanvasBox);
  const lassoX = lassoCanvasBox.x + lassoCanvasBox.width / 2, lassoY = lassoCanvasBox.y + lassoCanvasBox.height / 2;
  await desktop.mouse.move(lassoX - 24, lassoY - 18);
  await desktop.mouse.down();
  await desktop.mouse.move(lassoX + 24, lassoY - 18, { steps: 3 });
  await desktop.mouse.move(lassoX + 10, lassoY + 22, { steps: 3 });
  await desktop.mouse.move(lassoX - 24, lassoY - 18, { steps: 3 });
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeLassoSelection, 'lasso selection must not add artwork history');

  // Magic-wand color selection creates a real mask without adding artwork history.
  const undoBeforeMagicSelection = await desktop.locator('#undo').isEnabled();
  await desktop.locator('#magic-select-tool').click();
  assert.equal(await desktop.locator('#magic-settings').isVisible(), true, 'magic-wand settings should follow the selected tool');
  await desktop.locator('#magic-tolerance').evaluate(element => { element.value = '12'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await desktop.locator('#magic-tolerance-value').textContent(), '12');
  const magicBox = await desktop.locator('#canvas').boundingBox();
  await desktop.mouse.click(magicBox.x + magicBox.width / 2, magicBox.y + magicBox.height / 2);
  await desktop.waitForFunction(() => /Color selection: [0-9,]+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeMagicSelection, 'magic-wand selection must not mutate artwork history');
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');
  await desktop.locator('#magic-tolerance').evaluate(element => { element.value = '0'; element.dispatchEvent(new Event('input', { bubbles: true })); });

  // Use a bounded rectangular selection to test invert/expand/contract independently of whether the magic-wand target is transparent.
  await desktop.locator('#select-tool').click();
  const maskBox = await desktop.locator('#canvas').boundingBox();
  const mx = maskBox.x + maskBox.width / 2, my = maskBox.y + maskBox.height / 2;
  await desktop.mouse.move(mx - 18, my - 14); await desktop.mouse.down();
  await desktop.mouse.move(mx + 18, my + 14); await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#selection-settings').isVisible(), true, 'selection mask operations should be visible for an active selection');
  await desktop.locator('#selection-invert').click();
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection inverted');
  await desktop.locator('#selection-expand').click();
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection expanded');
  await desktop.locator('#selection-contract').click();
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection contracted');
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');

  // Selected pixels can be nudged independently from the selection outline; this is a real canvas command.
  await desktop.locator('#select-tool').click();
  const transformBox = await desktop.locator('#canvas').boundingBox();
  const tx = transformBox.x + transformBox.width / 2, ty = transformBox.y + transformBox.height / 2;
  await desktop.mouse.move(tx - 15, ty - 12); await desktop.mouse.down();
  await desktop.mouse.move(tx + 15, ty + 12); await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#selection-settings [data-transform="right"]').isVisible(), true, 'selection move controls should appear with an active selection');
  await desktop.locator('#selection-settings [data-transform="right"]').click();
  await desktop.waitForFunction(() => /Transformed selection|Selection moved without changing visible pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await desktop.locator('#selection-settings').isVisible(), true, 'the selection should remain available after moving its pixels');
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');

  // Elliptical marquee selection is a view-only selection operation and clears without touching pixels.
  const undoBeforeEllipseSelection = await desktop.locator('#undo').isEnabled();
  await desktop.locator('#ellipse-select-tool').click();
  assert.equal(await desktop.locator('#ellipse-select-tool').evaluate(element => element.classList.contains('active')), true);
  const ellipseCanvasBox = await desktop.locator('#canvas').boundingBox();
  assert.ok(ellipseCanvasBox);
  await desktop.mouse.move(ellipseCanvasBox.x + ellipseCanvasBox.width / 2 - 24, ellipseCanvasBox.y + ellipseCanvasBox.height / 2 - 18);
  await desktop.mouse.down();
  await desktop.mouse.move(ellipseCanvasBox.x + ellipseCanvasBox.width / 2 + 24, ellipseCanvasBox.y + ellipseCanvasBox.height / 2 + 18);
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeEllipseSelection, 'ellipse selection must not add artwork history');

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
  const selectedEditPoint = { x: selectCanvasBox.x + selectCanvasBox.width / 2, y: selectCanvasBox.y + selectCanvasBox.height / 2 };
  await desktop.mouse.click(selectedEditPoint.x, selectedEditPoint.y);
  const pixelsBeforeSelectionDelete = await settledCanvasData();
  await desktop.locator('#select-tool').click();
  await desktop.mouse.move(selectedEditPoint.x - 12, selectedEditPoint.y - 10);
  await desktop.mouse.down();
  await desktop.mouse.move(selectedEditPoint.x + 12, selectedEditPoint.y + 10);
  await desktop.mouse.up();
  await desktop.keyboard.press('Delete');
  await desktop.waitForFunction(() => /Cleared [0-9,]+ pixels from selection/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.locator('#undo').click();
  assert.equal(await settledCanvasData(), pixelsBeforeSelectionDelete, 'deleting a selection must be one reversible pixel operation');

  // Copy/cut/paste must round-trip selected active-layer pixels without touching outside pixels.
  await desktop.locator('#select-tool').click();
  await desktop.mouse.move(selectedEditPoint.x - 12, selectedEditPoint.y - 10);
  await desktop.mouse.down();
  await desktop.mouse.move(selectedEditPoint.x + 12, selectedEditPoint.y + 10);
  await desktop.mouse.up();
  const beforeClipboardRoundTrip = await settledCanvasData();
  await desktop.keyboard.press('Control+x');
  await desktop.waitForFunction(() => /Selection cut to internal clipboard/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.keyboard.press('Control+v');
  await desktop.waitForFunction(() => /Pasted [0-9,]+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.equal(await settledCanvasData(), beforeClipboardRoundTrip, 'cut then paste at the selection origin must restore exact canvas pixels');
  await desktop.keyboard.press('Escape');

  const undoBeforeSelectAll = await desktop.locator('#undo').isEnabled();
  await desktop.keyboard.press('Control+a');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selected entire canvas');
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeSelectAll, 'select-all must only change the selection mask, not artwork history');
  await desktop.keyboard.press('Escape');
  await desktop.waitForFunction(() => document.querySelector('#status')?.textContent === 'Selection cleared');

  // Transform previews are view-only until Apply; Cancel must preserve both pixels and history.
  await desktop.locator('#brush-tool').click();
  await desktop.locator('#color').evaluate(element => { element.value = '#12abef'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const transformCanvas = await desktop.locator('#canvas').boundingBox();
  assert.ok(transformCanvas);
  const transformPoint = { x: transformCanvas.x + transformCanvas.width / 2, y: transformCanvas.y + transformCanvas.height / 2 };
  const beforeTransformStroke = await settledCanvasData();
  await desktop.mouse.click(transformPoint.x, transformPoint.y);
  const afterTransformStroke = await settledCanvasData();
  assert.notEqual(afterTransformStroke, beforeTransformStroke, 'setup stroke should change the canvas');
  await desktop.locator('#select-tool').click();
  await desktop.mouse.move(transformPoint.x - 30, transformPoint.y - 24);
  await desktop.mouse.down();
  await desktop.mouse.move(transformPoint.x + 30, transformPoint.y + 24);
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.locator('#transform-scale-x').fill('200');
  await desktop.locator('#transform-scale-y').fill('150');
  await desktop.locator('#transform-preview').click();
  await desktop.waitForFunction(() => document.querySelector('#transform-apply')?.disabled === false);
  assert.equal(await desktop.locator('#undo').isEnabled(), true, 'preview must not clear or add history');
  assert.match(await desktop.locator('#status').textContent(), /Transform preview/);
  await desktop.locator('#transform-cancel').click();
  assert.equal(await desktop.locator('#transform-apply').isDisabled(), true, 'cancel must discard preview state');
  await desktop.keyboard.press('Escape');
  await desktop.locator('#undo').click();
  assert.equal(await settledCanvasData(), beforeTransformStroke, 'cancelled transform preview must not consume the undo slot');

  // Applying a transform commits one edit; undo restores the exact pre-transform image.
  await desktop.locator('#brush-tool').click();
  await desktop.mouse.click(transformPoint.x, transformPoint.y);
  const beforeTransformApply = await settledCanvasData();
  await desktop.locator('#select-tool').click();
  await desktop.mouse.move(transformPoint.x - 30, transformPoint.y - 24);
  await desktop.mouse.down();
  await desktop.mouse.move(transformPoint.x + 30, transformPoint.y + 24);
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.locator('#transform-scale-x').fill('200');
  await desktop.locator('#transform-scale-y').fill('200');
  await desktop.locator('#transform-rotation').selectOption('90');
  await desktop.locator('#transform-preview').click();
  await desktop.waitForFunction(() => document.querySelector('#transform-apply')?.disabled === false);
  await desktop.locator('#transform-apply').click();
  await desktop.waitForFunction(() => /Transform applied/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.keyboard.press('Escape');
  const afterTransformApply = await settledCanvasData();
  assert.notEqual(afterTransformApply, beforeTransformApply, 'applied scale/rotation should change the visible artwork');
  await desktop.locator('#undo').click();
  await desktop.keyboard.press('Escape');
  assert.equal(await settledCanvasData(), beforeTransformApply, 'one undo must restore the exact pre-transform image');
  await desktop.locator('#redo').click();
  await desktop.keyboard.press('Escape');

  // Crop preview is non-destructive; committing resizes all layers and undo restores canvas dimensions.
  const beforeCropSize = await desktop.locator('#document-size').textContent();
  await desktop.locator('#select-tool').click();
  const cropBox = await desktop.locator('#canvas').boundingBox();
  const cropCenterX = cropBox.x + cropBox.width / 2, cropCenterY = cropBox.y + cropBox.height / 2;
  await desktop.mouse.move(cropCenterX - 28, cropCenterY - 22);
  await desktop.mouse.down();
  await desktop.mouse.move(cropCenterX + 28, cropCenterY + 22);
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Selected \d+ × \d+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  await desktop.locator('#crop-preview').click();
  await desktop.waitForFunction(() => document.querySelector('#crop-apply')?.disabled === false);
  assert.equal(await desktop.locator('#document-size').textContent(), beforeCropSize, 'crop preview must not resize the actual document');
  await desktop.locator('#crop-cancel').click();
  assert.equal(await desktop.locator('#document-size').textContent(), beforeCropSize, 'cancelled crop must preserve dimensions');
  await desktop.locator('#crop-preview').click();
  await desktop.locator('#crop-apply').click();
  await desktop.waitForFunction(expected => document.querySelector('#document-size')?.textContent !== expected, beforeCropSize);
  const croppedSize = await desktop.locator('#document-size').textContent();
  assert.notEqual(croppedSize, beforeCropSize, 'crop apply must update document dimensions');
  await desktop.locator('#undo').click();
  await desktop.waitForFunction(expected => document.querySelector('#document-size')?.textContent === expected, beforeCropSize);
  await desktop.locator('#redo').click();
  await desktop.waitForFunction(expected => document.querySelector('#document-size')?.textContent === expected, croppedSize);
  await desktop.locator('#undo').click();
  await desktop.waitForFunction(expected => document.querySelector('#document-size')?.textContent === expected, beforeCropSize);
  await desktop.keyboard.press('Escape');

  // Use an isolated context so desktop autosaved state cannot leak into the mobile smoke tests.
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => failures.push(`mobile page error: ${error.message}`));
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => /Ready|Recovered latest local project|Local recovery unavailable/.test(document.querySelector('#status')?.textContent ?? ''));
  await mobile.locator('#layers-tab').click();
  assert.equal(await mobile.locator('.inspector').evaluate(element => element.classList.contains('show-layers')), true, 'mobile Layers tab should switch the compact inspector');
  assert.equal(await mobile.locator('#layers-tab').getAttribute('aria-selected'), 'true');
  await mobile.locator('#ai-tab').click();
  assert.equal(await mobile.locator('#ai-tab').getAttribute('aria-selected'), 'true', 'mobile AI tab should select the isolated workspace');
  assert.equal(await mobile.locator('#ai-workspace-panel').isVisible(), true, 'mobile AI tab should reveal the sandbox preview');
  assert.equal(await mobile.locator('.layer-section').isVisible(), false, 'mobile AI tab should hide unrelated panels');
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
  await mobile.locator('#rectangle-tool').click();
  assert.equal(await mobile.locator('#cursor-mode').getAttribute('aria-pressed'), 'false', 'choosing a geometric tool must leave cursor mode automatically');
  assert.equal(await mobile.locator('#rectangle-tool').evaluate(element => element.classList.contains('active')), true, 'the selected geometric tool must receive input after leaving cursor mode');
  await mobile.locator('#brush-tool').click();
  const directTouchCanvas = await mobile.locator('#canvas').boundingBox();
  assert.ok(directTouchCanvas);
  const startX = directTouchCanvas.x + directTouchCanvas.width / 2, startY = directTouchCanvas.y + directTouchCanvas.height / 2;
  const drawHoldBounds = await mobile.locator('#draw-hold').boundingBox();
  assert.ok(drawHoldBounds && drawHoldBounds.width > 70, 'mobile draw-hold control must be reachable');
  const holdX = drawHoldBounds.x + drawHoldBounds.width / 2, holdY = drawHoldBounds.y + drawHoldBounds.height / 2;

  // Releasing the hold while the cursor finger remains down must stop drawing immediately.
  const beforeReleaseHold = await settledCanvasData();
  await mobile.mouse.move(holdX, holdY);
  await mobile.mouse.down();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: startX + 18, y: startY + 8 }] });
  await mobile.mouse.up();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: startX + 28, y: startY + 14 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  await mobile.locator('#undo').click();
  assert.equal(await settledCanvasData(), beforeReleaseHold, 'release must stop drawing without leaving a second history action');

  // Also exercise the real two-touch pattern: one touch holds the control, the other moves the cursor.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: holdX, y: holdY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: holdX, y: holdY }, { id: 4, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: holdX, y: holdY }, { id: 4, x: startX + 18, y: startY + 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#undo')?.disabled === false);
  assert.equal(await mobile.locator('#undo').isEnabled(), true, 'two-touch hold-to-draw must create an undoable stroke');
  await mobile.locator('#undo').click();
  assert.equal(await mobile.locator('#undo').isEnabled(), false, 'the two-touch hold stroke should undo as one action');
  const beforeEscapeCancel = await settledCanvasData();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 5, x: holdX, y: holdY }, { id: 6, x: startX, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 5, x: holdX, y: holdY }, { id: 6, x: startX + 18, y: startY + 8 }] });
  await mobile.keyboard.press('Escape');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await settledCanvasData(), beforeEscapeCancel, 'Escape must cancel an in-progress touch stroke without changing artwork');
  assert.equal(await mobile.locator('#draw-hold').getAttribute('aria-pressed'), 'false', 'Escape must release the draw-hold state');
  // Game-asset templates create the expected dimensions and useful editable layer stacks.
  await desktop.locator('#new-document').click();
  await desktop.locator('#new-template').selectOption('character');
  assert.equal(await desktop.locator('#new-width').inputValue(), '64');
  assert.equal(await desktop.locator('#new-height').inputValue(), '64');
  await desktop.locator('#create-new').click();
  await desktop.waitForFunction(() => document.querySelector('#document-size')?.textContent === '64 × 64' && document.querySelector('#layer-count')?.textContent === '4 layers');
  assert.equal(await desktop.locator('#undo').isEnabled(), false, 'template starter layers should be the initial document state, not user undo history');
  // Eight-way symmetry must stay geometrically valid on a rectangular document.
  await desktop.locator('#new-document').click();
  await desktop.locator('#new-template').selectOption('custom');
  await desktop.locator('#new-name').fill('Rectangular symmetry check');
  await desktop.locator('#new-width').fill('96');
  await desktop.locator('#new-height').fill('64');
  await desktop.locator('#create-new').click();
  await desktop.waitForFunction(() => document.querySelector('#document-size')?.textContent === '96 × 64');
  await desktop.locator('#symmetry-mode').selectOption('8');
  await desktop.locator('#brush-tool').click();
  const rectangularCanvas = await desktop.locator('#canvas').boundingBox();
  assert.ok(rectangularCanvas);
  const rectangularBefore = await settledCanvasData();
  await desktop.mouse.move(rectangularCanvas.x + rectangularCanvas.width / 2 + 20, rectangularCanvas.y + rectangularCanvas.height / 2 + 6);
  await desktop.mouse.down();
  await desktop.mouse.up();
  const rectangularAfter = await settledCanvasData();
  assert.notEqual(rectangularAfter, rectangularBefore, 'eight-way symmetry should draw on a non-square canvas');
  await desktop.locator('#undo').click();
  assert.equal(await settledCanvasData(), rectangularBefore, 'rectangular symmetric stroke must undo atomically');

  // Linear gradient preview must not mutate pixels until release, then commit as one undoable edit.
  await desktop.locator('#gradient-tool').click();
  assert.equal(await desktop.locator('#gradient-tool').evaluate(element => element.classList.contains('active')), true);
  const gradientBox = await desktop.locator('#canvas').boundingBox();
  const gx1 = gradientBox.x + gradientBox.width * .2, gy = gradientBox.y + gradientBox.height * .5;
  const gx2 = gradientBox.x + gradientBox.width * .8;
  const beforeGradient = await settledCanvasData();
  const undoBeforeGradientPreview = await desktop.locator('#undo').isEnabled();
  await desktop.mouse.move(gx1, gy); await desktop.mouse.down(); await desktop.mouse.move(gx2, gy, { steps: 4 });
  assert.equal(await desktop.locator('#undo').isEnabled(), undoBeforeGradientPreview, 'gradient preview must not add artwork history before release');
  await desktop.mouse.up();
  await desktop.waitForFunction(() => /Gradient applied to [0-9,]+ pixels/.test(document.querySelector('#status')?.textContent ?? ''));
  assert.notEqual(await settledCanvasData(), beforeGradient, 'gradient release must apply visible pixels');
  await desktop.locator('#undo').click();
  assert.equal(await settledCanvasData(), beforeGradient, 'gradient must undo as one action');
  await desktop.locator('#symmetry-mode').selectOption('0');
  assert.deepEqual(failures, [], 'no uncaught browser JavaScript errors should occur');
  console.log('Browser smoke checks passed: legacy IndexedDB migration; PNG/JPEG/WebP/GIF imports; drawing, undo/redo and layers; transparent PNG export; safe project-copy import; oversized-image rejection; save during stroke; keyboard controls; mobile direct touch drawing, virtual cursor/hold compatibility and cancellation.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
