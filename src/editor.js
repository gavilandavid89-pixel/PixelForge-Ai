import { RasterDocument, screenToDocument, validateDimensions } from './core.js';
import { loadMostRecentProject, saveProject, listSavedProjects, loadProjectById } from './persistence.js';
import { preflightImageFile } from './image-import.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#canvas'), ctx = canvas.getContext('2d', { alpha: true });
const workArea = $('#work-area');
const previewCanvas = document.createElement('canvas'), previewCtx = previewCanvas.getContext('2d', { alpha: true });
let doc = new RasterDocument(128, 128), tool = 'draw', spaceDown = false;
let color = $('#color').value, brushSize = Number($('#brush-size').value);
let fillTolerance = 0, fillContiguous = true, sampleMerged = true, returnTool = 'draw';
let zoom = 3, panX = 0, panY = 0, activeStroke = null, pointerId = null, gridEnabled = false;
let drawHeld = false, drawHoldPointerId = null;
let selection = null, selectionStart = null, selectionPointerId = null;
let cursorMode = false, cursorGesturePointerId = null, cursorGestureLast = null, cursorDrawPointerId = null;
let virtualCursorPointerId = null, virtualCursorScreen = null, virtualCursorPoint = null, virtualCursorVisible = false;
let panning = false, panStart = null, autosaveTimer = null, autosaveInFlight = Promise.resolve(), flushInProgress = false, flushPromise = null, renderQueued = false, previewReady = false;

function status(message, kind = 'neutral') {
  $('#status').textContent = message;
  $('#status').dataset.kind = kind;
}
function updateTitle() {
  $('#document-name').textContent = doc.name;
  $('#document-size').textContent = `${doc.width} × ${doc.height}`;
  $('#layer-count').textContent = `${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'}`;
  $('#undo').disabled = doc.history.length === 0;
  $('#redo').disabled = doc.future.length === 0;
  $('#save').dataset.dirty = String(doc.dirty);
}
function resizeCanvas() {
  const rect = workArea.getBoundingClientRect(), dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  render();
}
function fitCanvas() {
  const rect = workArea.getBoundingClientRect();
  const fitScale = Math.min((rect.width - 80) / doc.width, (rect.height - 80) / doc.height);
  zoom = Number.isFinite(fitScale) ? Math.max(.01, Math.min(24, Math.floor(fitScale * 100) / 100)) : 1;
  panX = (rect.width - doc.width * zoom) / 2;
  panY = (rect.height - doc.height * zoom) / 2;
  render();
}
function zoomAt(point, targetZoom) {
  const before = { x: (point.x - panX) / zoom, y: (point.y - panY) / zoom };
  zoom = Math.max(.01, Math.min(24, targetZoom));
  panX = point.x - before.x * zoom; panY = point.y - before.y * zoom;
  render();
}
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!canvas.width || !canvas.height) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#171922'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (previewCanvas.width !== doc.width || previewCanvas.height !== doc.height) {
      previewCanvas.width = doc.width; previewCanvas.height = doc.height; previewReady = false;
    }
    const dirtyTiles = doc.getCompositeDirtyTiles();
    const composite = doc.composite();
    if (!previewReady) {
      previewCtx.putImageData(new ImageData(new Uint8ClampedArray(composite), doc.width, doc.height), 0, 0);
      previewReady = true;
      doc.clearCompositeDirtyTiles();
    } else if (dirtyTiles.length) {
      for (const tile of dirtyTiles) {
        const tilePixels = new Uint8ClampedArray(tile.width * tile.height * 4);
        for (let row = 0; row < tile.height; row++) {
          const sourceStart = ((tile.tileY * 64 + row) * doc.width + tile.tileX * 64) * 4;
          tilePixels.set(composite.subarray(sourceStart, sourceStart + tile.width * 4), row * tile.width * 4);
        }
        previewCtx.putImageData(new ImageData(tilePixels, tile.width, tile.height), tile.tileX * 64, tile.tileY * 64);
      }
      doc.clearCompositeDirtyTiles();
    }
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#20232d';
    ctx.fillRect(panX - 1, panY - 1, doc.width * zoom + 2, doc.height * zoom + 2);
    ctx.drawImage(previewCanvas, panX, panY, doc.width * zoom, doc.height * zoom);
    ctx.strokeStyle = '#555b6c'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(panX) + .5, Math.round(panY) + .5, Math.round(doc.width * zoom), Math.round(doc.height * zoom));
    // View-only pixel grid: clipped to the visible canvas region and never part of document pixels/exports.
    if (gridEnabled && zoom >= 4) {
      const left = Math.max(1, Math.ceil(-panX / zoom));
      const right = Math.min(doc.width - 1, Math.floor((canvas.clientWidth - panX) / zoom));
      const top = Math.max(1, Math.ceil(-panY / zoom));
      const bottom = Math.min(doc.height - 1, Math.floor((canvas.clientHeight - panY) / zoom));
      ctx.save();
      ctx.beginPath();
      ctx.rect(panX, panY, doc.width * zoom, doc.height * zoom);
      ctx.clip();
      ctx.strokeStyle = 'rgba(20, 22, 31, 0.42)';
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let x = left; x <= right; x++) {
        const screenX = Math.round(panX + x * zoom) + .5 / dpr;
        ctx.moveTo(screenX, Math.max(0, panY));
        ctx.lineTo(screenX, Math.min(canvas.clientHeight, panY + doc.height * zoom));
      }
      for (let y = top; y <= bottom; y++) {
        const screenY = Math.round(panY + y * zoom) + .5 / dpr;
        ctx.moveTo(Math.max(0, panX), screenY);
        ctx.lineTo(Math.min(canvas.clientWidth, panX + doc.width * zoom), screenY);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (selection) {
      const sx = panX + selection.x * zoom, sy = panY + selection.y * zoom;
      const sw = selection.width * zoom, sh = selection.height * zoom;
      ctx.save(); ctx.strokeStyle = '#f4f0ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.round(sx) + .5, Math.round(sy) + .5, Math.max(0, sw - 1), Math.max(0, sh - 1));
      ctx.strokeStyle = '#282532'; ctx.lineDashOffset = 5; ctx.strokeRect(Math.round(sx) + .5, Math.round(sy) + .5, Math.max(0, sw - 1), Math.max(0, sh - 1)); ctx.restore();
    }
    if (virtualCursorVisible && virtualCursorScreen && (cursorMode || virtualCursorPointerId !== null)) {
      const radius = Math.max(2, Math.min(48, brushSize * zoom / 2));
      ctx.save(); ctx.strokeStyle = cursorMode ? '#69dfbb' : drawHeld ? '#69dfbb' : '#e8eaf2'; ctx.lineWidth = 1.25;
      if (['draw', 'erase'].includes(tool)) { ctx.beginPath(); ctx.arc(virtualCursorScreen.x, virtualCursorScreen.y, radius, 0, Math.PI * 2); ctx.stroke(); }
      // Small arrow/pencil marker for the independent on-screen cursor.
      ctx.beginPath(); ctx.moveTo(virtualCursorScreen.x + 1, virtualCursorScreen.y + 1);
      ctx.lineTo(virtualCursorScreen.x + 1, virtualCursorScreen.y + 17); ctx.lineTo(virtualCursorScreen.x + 5, virtualCursorScreen.y + 13);
      ctx.lineTo(virtualCursorScreen.x + 8, virtualCursorScreen.y + 20); ctx.lineTo(virtualCursorScreen.x + 11, virtualCursorScreen.y + 18);
      ctx.lineTo(virtualCursorScreen.x + 8, virtualCursorScreen.y + 11); ctx.lineTo(virtualCursorScreen.x + 13, virtualCursorScreen.y + 11);
      ctx.closePath(); ctx.fillStyle = '#171922'; ctx.fill(); ctx.stroke(); ctx.restore();
    }
    $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  });
}
function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function documentPointFromScreen(point) { return screenToDocument(point, { zoom, panX, panY }, doc); }
function docPoint(event) { return documentPointFromScreen(eventPoint(event)); }
function moveVirtualCursorBy(dx, dy) {
  if (!virtualCursorScreen) virtualCursorScreen = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  virtualCursorScreen = { x: Math.max(0, Math.min(canvas.clientWidth, virtualCursorScreen.x + dx)), y: Math.max(0, Math.min(canvas.clientHeight, virtualCursorScreen.y + dy)) };
  virtualCursorPoint = documentPointFromScreen(virtualCursorScreen); virtualCursorVisible = true; render();
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer); autosaveTimer = null;
  status('Unsaved changes', 'warning');
  if (flushInProgress) return;
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const savingDoc = doc, version = savingDoc.saveVersion, snapshot = savingDoc.toJSON();
    const operation = autosaveInFlight.catch(() => {}).then(async () => {
      await saveProject(snapshot);
      savingDoc.dirty = savingDoc.saveVersion !== version;
      if (doc === savingDoc) {
        status(savingDoc.dirty ? 'Unsaved changes' : 'Saved on this device', savingDoc.dirty ? 'warning' : 'success');
        updateTitle();
      }
    });
    autosaveInFlight = operation.catch(error => {
      if (doc === savingDoc) status(`Autosave unavailable: ${error.message}`, 'error');
    });
  }, 800);
}
function settleActiveInput() {
  if (activeStroke) finishActiveStroke(true);
  drawHeld = false; drawHoldPointerId = null; updateDrawHoldUI();
}
async function flushAutosave({ force = false } = {}) {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    settleActiveInput();
    const pending = autosaveTimer !== null;
    if (pending) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    const savingDoc = doc;
    flushInProgress = true;
    try {
      await autosaveInFlight;
      if (!savingDoc.dirty && !pending && !force) return;
      while (doc === savingDoc) {
        const version = savingDoc.saveVersion, snapshot = savingDoc.toJSON();
        await saveProject(snapshot);
        if (savingDoc.saveVersion === version) { savingDoc.dirty = false; break; }
        savingDoc.dirty = true;
      }
      if (doc === savingDoc) updateTitle();
    } finally {
      flushInProgress = false;
      if (doc === savingDoc && savingDoc.dirty) scheduleAutosave();
    }
  })();
  try { await flushPromise; }
  finally { flushPromise = null; }
}
function changed() { render(); updateTitle(); scheduleAutosave(); }
function startStrokeAt(point, id) {
  if (!point?.inside || activeStroke) return;
  try {
    activeStroke = doc.beginStroke({ color, size: brushSize, mode: tool });
    pointerId = id;
    doc.strokeTo(activeStroke, point.x, point.y);
    render();
  } catch (error) { status(error.message, 'error'); }
}
function performSample(point) {
  if (!point?.inside) return;
  try {
    const sampled = doc.sampleColorAt(point.x, point.y, { merged: sampleMerged });
    if (!sampled) status('No visible color at this pixel', 'neutral');
    else {
      color = sampled;
      $('#color').value = sampled;
      $('#color-value').textContent = sampled;
      status(`Sampled ${sampled}`, 'success');
    }
    setTool(returnTool);
  } catch (error) { status(error.message, 'error'); }
}
function performFill(point) {
  if (!point?.inside || flushInProgress) return;
  try {
    const count = doc.fillAt(point.x, point.y, { color, tolerance: fillTolerance, contiguous: fillContiguous });
    if (count) { changed(); status(`Filled ${count.toLocaleString()} pixels`, 'success'); }
    else status('Fill made no changes', 'neutral');
  } catch (error) { status(error.message, 'error'); }
}
function beginStroke(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const point = docPoint(event);
  if (!point.inside) return;
  try { canvas.setPointerCapture?.(event.pointerId); } catch {}
  startStrokeAt(point, event.pointerId);
}
function moveStroke(event) {
  if (selectionStart && event.pointerId === selectionPointerId) {
    const point = docPoint(event);
    const x = Math.max(0, Math.min(doc.width - 1, point.x)), y = Math.max(0, Math.min(doc.height - 1, point.y));
    const left = Math.min(selectionStart.x, x), top = Math.min(selectionStart.y, y);
    selection = { x: left, y: top, width: Math.abs(x - selectionStart.x) + 1, height: Math.abs(y - selectionStart.y) + 1 };
    render(); return;
  }
  if (panning && panStart) {
    const p = eventPoint(event);
    panX = panStart.panX + p.x - panStart.x; panY = panStart.panY + p.y - panStart.y;
    render(); return;
  }
  if (event.pointerType === 'touch' && event.pointerId === virtualCursorPointerId) {
    virtualCursorScreen = eventPoint(event); virtualCursorPoint = docPoint(event); virtualCursorVisible = true;
    if (['draw', 'erase'].includes(tool)) {
      if (!activeStroke) startStrokeAt(virtualCursorPoint, event.pointerId);
      else if (pointerId === event.pointerId && virtualCursorPoint.inside) doc.strokeTo(activeStroke, virtualCursorPoint.x, virtualCursorPoint.y);
    }
    render(); return;
  }
  if (!activeStroke || event.pointerId !== pointerId) return;
  const point = docPoint(event);
  if (point.inside) doc.strokeTo(activeStroke, point.x, point.y);
  render();
}
function finishActiveStroke(commit = true) {
  if (!activeStroke) return;
  doc.endStroke(activeStroke, { commit }); activeStroke = null; pointerId = null;
  if (commit) changed(); else render();
}
function endStroke(event, commit = true) {
  if (!activeStroke || (event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
  finishActiveStroke(commit);
}
canvas.addEventListener('pointerdown', event => {
  if (flushInProgress) { event.preventDefault(); return; }
  if (cursorMode) { event.preventDefault(); return; }
  if (tool === 'select') {
    const point = docPoint(event); if (!point.inside) return;
    selectionStart = { x: point.x, y: point.y }; selectionPointerId = event.pointerId;
    selection = { x: point.x, y: point.y, width: 1, height: 1 };
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    render(); event.preventDefault(); return;
  }
  if (tool === 'eyedropper') { if (event.button === undefined || event.button === 0) performSample(docPoint(event)); event.preventDefault(); return; }
  if (tool === 'fill') { if (event.button === undefined || event.button === 0) performFill(docPoint(event)); event.preventDefault(); return; }
  if (tool === 'pan' || event.button === 1 || spaceDown) {
    panning = true;
    const p = eventPoint(event); panStart = { x: p.x, y: p.y, panX, panY };
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    canvas.classList.add('is-panning'); event.preventDefault(); return;
  }
  if (event.pointerType === 'touch') {
    // Keep one canvas touch as the drawing pointer; extra fingers must not steal its stroke.
    if (virtualCursorPointerId !== null && virtualCursorPointerId !== event.pointerId) { event.preventDefault(); return; }
    virtualCursorPointerId = event.pointerId; virtualCursorScreen = eventPoint(event);
    virtualCursorPoint = docPoint(event); virtualCursorVisible = true;
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    if (['draw', 'erase'].includes(tool)) startStrokeAt(virtualCursorPoint, event.pointerId);
    render(); event.preventDefault(); return;
  }
  beginStroke(event);
});
canvas.addEventListener('pointermove', moveStroke);
window.addEventListener('pointerdown', event => {
  if (!cursorMode || event.pointerType !== 'touch' || cursorGesturePointerId !== null) return;
  if (event.target instanceof Element && event.target.closest('#brush-scrub')) return;
  cursorGesturePointerId = event.pointerId; cursorGestureLast = { x: event.clientX, y: event.clientY };
}, true);
window.addEventListener('pointermove', event => {
  if (!cursorMode || event.pointerType !== 'touch' || event.pointerId !== cursorGesturePointerId || !cursorGestureLast) return;
  const dx = event.clientX - cursorGestureLast.x, dy = event.clientY - cursorGestureLast.y;
  cursorGestureLast = { x: event.clientX, y: event.clientY };
  if (dx || dy) moveVirtualCursorBy(dx, dy);
}, true);
function finishCursorGesture(event) { if (event.pointerId === cursorGesturePointerId) { cursorGesturePointerId = null; cursorGestureLast = null; } }
window.addEventListener('pointerup', finishCursorGesture, true);
window.addEventListener('pointercancel', finishCursorGesture, true);
canvas.addEventListener('pointerup', event => {
  if (selectionStart && event.pointerId === selectionPointerId) { selectionStart = null; selectionPointerId = null; status(`Selected ${selection.width} × ${selection.height} pixels`, 'success'); render(); return; }
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); return; }
  if (event.pointerType === 'touch' && event.pointerId === virtualCursorPointerId) {
    if (activeStroke && pointerId === event.pointerId) finishActiveStroke(true);
    virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false; render(); return;
  }
  endStroke(event, true);
});
canvas.addEventListener('pointercancel', event => {
  if (selectionStart && event.pointerId === selectionPointerId) { selectionStart = null; selectionPointerId = null; selection = null; render(); return; }
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); }
  if (event.pointerType === 'touch' && event.pointerId === virtualCursorPointerId) {
    if (activeStroke && pointerId === event.pointerId) finishActiveStroke(false);
    virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false; render(); return;
  }
  endStroke(event, false);
});
canvas.addEventListener('lostpointercapture', event => {
  if (event.pointerType === 'touch' && event.pointerId === virtualCursorPointerId) {
    if (activeStroke && pointerId === event.pointerId) finishActiveStroke(false);
    virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false; render(); return;
  }
  endStroke(event, false);
});
const drawHoldButton = $('#draw-hold');
function updateDrawHoldUI() {
  if (!drawHoldButton) return;
  drawHoldButton.classList.toggle('held', drawHeld);
  drawHoldButton.setAttribute('aria-pressed', String(drawHeld));
  drawHoldButton.disabled = cursorMode || !['draw', 'erase'].includes(tool);
  drawHoldButton.style.display = cursorMode ? 'none' : '';
  drawHoldButton.querySelector('small').textContent = cursorMode ? 'Cursor active' : tool === 'erase' ? 'Hold to erase' : tool === 'pan' ? 'Pan selected' : tool === 'select' ? 'Select area' : tool === 'fill' ? 'Fill selected' : tool === 'eyedropper' ? 'Sample color' : 'Hold to draw';
}
drawHoldButton?.addEventListener('pointerdown', event => {
  if (!['draw', 'erase'].includes(tool) || flushInProgress || drawHeld) { event.preventDefault(); return; }
  event.preventDefault(); drawHeld = true; drawHoldPointerId = event.pointerId; updateDrawHoldUI();
  try { drawHoldButton.setPointerCapture(event.pointerId); } catch {}
  if (virtualCursorPointerId !== null && virtualCursorPoint?.inside && !activeStroke) startStrokeAt(virtualCursorPoint, virtualCursorPointerId);
  render();
});
drawHoldButton?.addEventListener('keydown', event => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault();
  if (event.repeat || drawHeld || !['draw', 'erase'].includes(tool) || flushInProgress) return;
  drawHeld = true; drawHoldPointerId = 'keyboard'; updateDrawHoldUI();
  if (virtualCursorPointerId !== null && virtualCursorPoint?.inside && !activeStroke) startStrokeAt(virtualCursorPoint, virtualCursorPointerId);
  render();
});
drawHoldButton?.addEventListener('keyup', event => {
  if (!['Space', 'Enter'].includes(event.code) || drawHoldPointerId !== 'keyboard') return;
  event.preventDefault();
  drawHeld = false; drawHoldPointerId = null; finishActiveStroke(true); updateDrawHoldUI(); render();
});
drawHoldButton?.addEventListener('blur', () => {
  if (!drawHeld) return;
  drawHeld = false; drawHoldPointerId = null; finishActiveStroke(false); updateDrawHoldUI(); render();
});
window.addEventListener('pointerup', event => {
  if (drawHoldPointerId !== event.pointerId) return;
  drawHeld = false; drawHoldPointerId = null; finishActiveStroke(true); updateDrawHoldUI(); render();
});
window.addEventListener('pointercancel', event => {
  if (drawHoldPointerId !== event.pointerId) return;
  drawHeld = false; drawHoldPointerId = null; finishActiveStroke(false); updateDrawHoldUI(); render();
});
drawHoldButton?.addEventListener('lostpointercapture', event => {
  if (drawHoldPointerId !== event.pointerId) return;
  drawHeld = false; drawHoldPointerId = null; finishActiveStroke(false); updateDrawHoldUI(); render();
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const p = eventPoint(event);
  zoomAt(p, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });

const cursorModeButton = $('#cursor-mode');
function setCursorMode(enabled) {
  cursorMode = Boolean(enabled);
  cursorModeButton.classList.toggle('active', cursorMode);
  cursorModeButton.setAttribute('aria-pressed', String(cursorMode));
  canvas.dataset.cursorMode = String(cursorMode);
  cursorGesturePointerId = null; cursorGestureLast = null;
  updateDrawHoldUI();
  if (cursorMode) {
    virtualCursorScreen ??= { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    virtualCursorPoint = documentPointFromScreen(virtualCursorScreen); virtualCursorVisible = true;
    status('Cursor mode: swipe anywhere to move; touch the size bar to draw', 'success');
  } else {
    virtualCursorVisible = false; virtualCursorScreen = null; virtualCursorPoint = null;
    status('Direct drawing mode', 'neutral');
  }
  render();
}
cursorModeButton.addEventListener('click', () => setCursorMode(!cursorMode));
$('#brush-tool').addEventListener('click', () => setTool('draw'));
$('#eraser-tool').addEventListener('click', () => setTool('erase'));
$('#pan-tool').addEventListener('click', () => setTool('pan'));
$('#fill-tool').addEventListener('click', () => setTool('fill'));
$('#eyedropper-tool').addEventListener('click', () => setTool('eyedropper'));
$('#select-tool').addEventListener('click', () => setTool('select'));
$('#sample-source').addEventListener('change', event => { sampleMerged = event.target.value === 'merged'; });
$('#fill-tolerance').addEventListener('input', event => { fillTolerance = Number(event.target.value); $('#fill-tolerance-value').textContent = `${fillTolerance}`; });
$('#fill-mode').addEventListener('change', event => { fillContiguous = event.target.value === 'contiguous'; });
const mobileInspector = window.matchMedia('(max-width: 760px)');
function setInspectorPanel(panel) {
  const layersVisible = panel === 'layers' && mobileInspector.matches;
  document.querySelector('.inspector').classList.toggle('show-layers', layersVisible);
  $('#properties-tab').classList.toggle('active', !layersVisible);
  $('#layers-tab').classList.toggle('active', layersVisible);
  $('#properties-tab').setAttribute('aria-selected', String(!layersVisible));
  $('#layers-tab').setAttribute('aria-selected', String(layersVisible));
}
$('#properties-tab').addEventListener('click', () => {
  if (mobileInspector.matches) setInspectorPanel('properties');
  else $('.inspector-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#layers-tab').addEventListener('click', () => {
  if (mobileInspector.matches) setInspectorPanel('layers');
  else $('#layers').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
mobileInspector.addEventListener('change', () => setInspectorPanel('properties'));
function setTool(next) {
  if (activeStroke) finishActiveStroke(false);
  if (next === 'eyedropper' && tool !== 'eyedropper') returnTool = ['draw', 'erase'].includes(tool) ? tool : 'draw';
  drawHeld = false; drawHoldPointerId = null;
  tool = next;
  $('#brush-tool').classList.toggle('active', tool === 'draw');
  $('#eraser-tool').classList.toggle('active', tool === 'erase');
  $('#pan-tool').classList.toggle('active', tool === 'pan');
  $('#fill-tool').classList.toggle('active', tool === 'fill');
  $('#eyedropper-tool').classList.toggle('active', tool === 'eyedropper');
  $('#select-tool').classList.toggle('active', tool === 'select');
  $('#tool-label').textContent = tool === 'draw' ? 'Pencil' : tool === 'erase' ? 'Eraser' : tool === 'fill' ? 'Bucket fill' : tool === 'eyedropper' ? 'Eyedropper' : tool === 'select' ? 'Rectangular selection' : 'Pan';
  $('#fill-settings').hidden = tool !== 'fill';
  $('#sample-settings').hidden = tool !== 'eyedropper';
  if (tool !== 'select') { selectionStart = null; selectionPointerId = null; }
  canvas.dataset.tool = tool;
  updateDrawHoldUI();
}
$('#color').addEventListener('input', event => {
  color = event.target.value; $('#color-value').textContent = color.toUpperCase();
  if (tool === 'erase') setTool('draw');
});
$('#brush-size').addEventListener('input', event => {
  brushSize = Number(event.target.value); $('#brush-size-value').textContent = `${brushSize} px`;
});
const brushScrub = $('#brush-scrub');
let scrubStartX = 0, scrubStartSize = brushSize, scrubPointerId = null;
function syncBrushSize(value) {
  brushSize = Math.max(1, Math.min(32, Math.round(value)));
  $('#brush-size').value = String(brushSize);
  $('#brush-size-value').textContent = `${brushSize} px`;
  brushScrub.setAttribute('aria-valuenow', String(brushSize));
  brushScrub.setAttribute('aria-valuetext', `${brushSize} pixel${brushSize === 1 ? '' : 's'}. Drag left for thicker, right for thinner.`);
}
function resetBrushScrub() {
  brushScrub.classList.remove('is-dragging');
  brushScrub.style.setProperty('--scrub-offset', '0%');
  scrubPointerId = null;
}
brushScrub.addEventListener('pointerdown', event => {
  if (event.button !== undefined && event.button !== 0) return;
  if (cursorMode && ['draw', 'erase'].includes(tool) && virtualCursorPoint?.inside && !flushInProgress && !activeStroke) {
    cursorDrawPointerId = event.pointerId;
    startStrokeAt(virtualCursorPoint, event.pointerId);
  }
  const rect = brushScrub.getBoundingClientRect();
  scrubStartX = rect.left + rect.width / 2;
  scrubStartSize = brushSize;
  scrubPointerId = event.pointerId;
  brushScrub.classList.add('is-dragging');
  brushScrub.style.setProperty('--scrub-offset', '0%');
  try { brushScrub.setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
});
brushScrub.addEventListener('pointermove', event => {
  if (scrubPointerId !== event.pointerId) return;
  const rect = brushScrub.getBoundingClientRect();
  const travel = Math.max(1, rect.width * 0.34);
  const displacement = Math.max(-1, Math.min(1, (event.clientX - scrubStartX) / travel));
  const eased = Math.pow(Math.abs(displacement), 1.8);
  const nextSize = displacement < 0
    ? scrubStartSize + (32 - scrubStartSize) * eased
    : scrubStartSize - (scrubStartSize - 1) * eased;
  syncBrushSize(nextSize);
  brushScrub.style.setProperty('--scrub-offset', `${displacement * 34}%`);
});
function finishBrushScrub(event) {
  if (scrubPointerId === null || (event?.pointerId !== undefined && event.pointerId !== scrubPointerId)) return;
  if (cursorDrawPointerId !== null && (event?.pointerId === undefined || event.pointerId === cursorDrawPointerId)) {
    if (activeStroke && pointerId === cursorDrawPointerId) finishActiveStroke(true);
    cursorDrawPointerId = null;
  }
  resetBrushScrub();
}
brushScrub.addEventListener('pointerup', finishBrushScrub);
brushScrub.addEventListener('pointercancel', finishBrushScrub);
brushScrub.addEventListener('lostpointercapture', finishBrushScrub);
brushScrub.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { syncBrushSize(brushSize + 1); event.preventDefault(); }
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { syncBrushSize(brushSize - 1); event.preventDefault(); }
  else if (event.key === 'Home') { syncBrushSize(1); event.preventDefault(); }
  else if (event.key === 'End') { syncBrushSize(32); event.preventDefault(); }
});

$('#undo').addEventListener('click', () => { if (doc.undo()) { changed(); renderLayers(); } });
$('#redo').addEventListener('click', () => { if (doc.redo()) { changed(); renderLayers(); } });
$('#fit').addEventListener('click', fitCanvas);
$('#grid-toggle').addEventListener('click', () => {
  gridEnabled = !gridEnabled;
  const button = $('#grid-toggle');
  button.textContent = `Pixel grid: ${gridEnabled ? 'On' : 'Off'}`;
  button.setAttribute('aria-pressed', String(gridEnabled));
  if (gridEnabled && zoom < 4) status('Pixel grid enabled; zoom to 400% or more to see individual cells', 'neutral');
  else status(gridEnabled ? 'Pixel grid overlay enabled' : 'Pixel grid overlay hidden', 'success');
  render();
});
const viewportCenter = () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
$('#zoom-in').addEventListener('click', () => zoomAt(viewportCenter(), zoom * 1.25));
$('#zoom-out').addEventListener('click', () => zoomAt(viewportCenter(), zoom / 1.25));
$('#add-layer').addEventListener('click', () => {
  try { doc.addLayer(); changed(); renderLayers(); status('Layer added', 'success'); }
  catch (error) { status(error.message, 'error'); }
});
$('#projects-button').addEventListener('click', async () => {
  try {
    await flushAutosave();
    await renderProjects();
    $('#projects-dialog').showModal();
  } catch (error) { status(`Could not open saved projects: ${error.message}`, 'error'); }
});
$('#close-projects').addEventListener('click', () => $('#projects-dialog').close());
async function renderProjects() {
  const list = $('#projects-list'); list.replaceChildren();
  const projects = await listSavedProjects();
  if (!projects.length) {
    const empty = document.createElement('p'); empty.className = 'project-empty';
    empty.textContent = 'No saved projects yet. Draw something and save it to see it here.';
    list.append(empty); return;
  }
  for (const project of projects) {
    const row = document.createElement('div'); row.className = 'saved-project';
    const open = document.createElement('button'); open.className = 'saved-project-open'; open.dataset.projectId = project.id;
    open.textContent = project.name || 'Untitled artwork';
    const details = document.createElement('small'); details.textContent = `${project.width} × ${project.height}`;
    open.append(details);
    if (project.id === doc.id) { open.disabled = true; open.classList.add('current'); }
    open.addEventListener('click', async () => {
      try {
        await flushAutosave();
        const saved = await loadProjectById(project.id);
        if (!saved) throw new Error('That saved project no longer exists.');
        doc = RasterDocument.fromJSON(saved);
        $('#projects-dialog').close(); fitCanvas(); updateTitle(); renderLayers();
        status('Opened saved project', 'success');
      } catch (error) { status(`Could not open project: ${error.message}`, 'error'); }
    });
    row.append(open); list.append(row);
  }
}

$('#new-document').addEventListener('click', () => $('#new-dialog').showModal());
$('#cancel-new').addEventListener('click', () => $('#new-dialog').close());
$('#create-new').addEventListener('click', async () => {
  const width = Number($('#new-width').value), height = Number($('#new-height').value);
  try {
    validateDimensions(width, height); await flushAutosave();
    doc = new RasterDocument(width, height, $('#new-name').value.trim() || 'Untitled artwork');
    $('#new-dialog').close(); fitCanvas(); updateTitle(); renderLayers(); scheduleAutosave();
    status('New document created', 'success');
  } catch (error) { $('#new-error').textContent = error.message; status(`Could not switch documents: ${error.message}`, 'error'); }
});
$('#save').addEventListener('click', async () => {
  try { await flushAutosave({ force: true }); status('Saved on this device', 'success'); }
  catch (error) { status(`Save failed: ${error.message}`, 'error'); }
});
$('#export-project').addEventListener('click', () => {
  try {
    settleActiveInput();
    const snapshot = doc.toJSON(), filename = `${safeName(doc.name)}.pforge`;
    downloadBlob(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), filename);
    status('Project exported', 'success');
  } catch (error) { status(`Project export failed: ${error.message}`, 'error'); }
});
$('#export-png').addEventListener('click', () => {
  try {
    settleActiveInput();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = doc.width; exportCanvas.height = doc.height;
    const exportName = `${safeName(doc.name)}.png`;
    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext) throw new Error('Could not create the PNG export surface.');
    exportContext.putImageData(new ImageData(new Uint8ClampedArray(doc.composite()), doc.width, doc.height), 0, 0);
    exportCanvas.toBlob(blob => {
      if (blob) { downloadBlob(blob, exportName); status('PNG exported', 'success'); }
      else status('PNG export failed', 'error');
    }, 'image/png');
  } catch (error) { status(`PNG export failed: ${error.message}`, 'error'); }
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 100 * 1024 * 1024) throw new RangeError('This file is larger than the 100 MiB import safety limit.');
    let importedDoc;
    if (file.name.toLowerCase().endsWith('.pforge') || file.type === 'application/json') {
      importedDoc = RasterDocument.fromJSON(JSON.parse(await file.text()), { newIdentity: true });
    } else {
      const expectedImage = await preflightImageFile(file);
      const bitmap = await createImageBitmap(file);
      try {
        if (!((bitmap.width === expectedImage.width && bitmap.height === expectedImage.height) || (bitmap.width === expectedImage.height && bitmap.height === expectedImage.width))) throw new RangeError('Decoded image dimensions do not match the verified file header.');
        validateDimensions(bitmap.width, bitmap.height);
        const name = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
        importedDoc = new RasterDocument(bitmap.width, bitmap.height, name || 'Imported artwork');
        const temp = document.createElement('canvas'); temp.width = bitmap.width; temp.height = bitmap.height;
        const tctx = temp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(bitmap, 0, 0);
        importedDoc.activeLayer.pixels.set(tctx.getImageData(0, 0, bitmap.width, bitmap.height).data);
      } finally { bitmap.close?.(); }
    }
    await flushAutosave(); await saveProject(importedDoc.toJSON()); doc = importedDoc;
    fitCanvas(); updateTitle(); renderLayers(); status('Import complete and saved locally', 'success');
  } catch (error) { status(`Import failed: ${error.message}`, 'error'); }
  finally { event.target.value = ''; }
});
function renderLayers() {
  const list = $('#layers'); list.replaceChildren();
  [...doc.layers].reverse().forEach(layer => {
    const row = document.createElement('div');
    row.className = `layer-row${layer.id === doc.activeLayerId ? ' selected' : ''}`;
    const layerIndex = doc.layers.findIndex(item => item.id === layer.id);
    const select = document.createElement('button');
    select.className = 'layer-select'; select.textContent = layer.name; select.title = 'Select layer';
    select.addEventListener('click', () => { doc.setActiveLayer(layer.id); renderLayers(); updateTitle(); scheduleAutosave(); });
    const visibility = document.createElement('button');
    visibility.className = 'layer-visibility'; visibility.textContent = layer.visible ? '◉' : '○';
    visibility.setAttribute('aria-label', layer.visible ? 'Hide layer' : 'Show layer');
    visibility.setAttribute('aria-pressed', String(layer.visible));
    visibility.addEventListener('click', () => { doc.setLayerVisibility(layer.id, !layer.visible); changed(); renderLayers(); });
    const lock = document.createElement('button');
    lock.className = 'layer-visibility layer-lock'; lock.textContent = layer.locked ? '🔒' : '♧';
    lock.setAttribute('aria-label', layer.locked ? 'Unlock layer' : 'Lock layer');
    lock.setAttribute('aria-pressed', String(layer.locked));
    lock.title = layer.locked ? 'Unlock layer for editing' : 'Lock layer against edits';
    lock.addEventListener('click', () => {
      doc.setLayerLocked(layer.id, !layer.locked);
      changed(); renderLayers();
      status(layer.locked ? 'Layer locked' : 'Layer unlocked', 'success');
    });
    const order = document.createElement('div'); order.className = 'layer-order-controls';
    const raise = document.createElement('button');
    raise.className = 'layer-order'; raise.textContent = '↑'; raise.title = 'Raise layer';
    raise.setAttribute('aria-label', 'Raise layer'); raise.disabled = layerIndex === doc.layers.length - 1;
    raise.addEventListener('click', () => {
      if (doc.moveLayer(layer.id, layerIndex + 1)) { changed(); renderLayers(); status('Layer moved up', 'success'); }
    });
    const lower = document.createElement('button');
    lower.className = 'layer-order'; lower.textContent = '↓'; lower.title = 'Lower layer';
    lower.setAttribute('aria-label', 'Lower layer'); lower.disabled = layerIndex === 0;
    lower.addEventListener('click', () => {
      if (doc.moveLayer(layer.id, layerIndex - 1)) { changed(); renderLayers(); status('Layer moved down', 'success'); }
    });
    order.append(raise, lower);
    row.append(visibility, select, lock, order); list.append(row);
  });
  updateDrawHoldUI();
}
function safeName(value) { return (value || 'pixelforge-artwork').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pixelforge-artwork'; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener('keydown', event => {
  const active = document.activeElement;
  const tag = active?.tagName;
  const textEntry = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || active?.isContentEditable;
  const nativeControl = active?.matches?.('button, select, summary, a[href], [role="button"]');
  const modifiedShortcut = event.ctrlKey || event.metaKey;
  if (event.code === 'Space' && !textEntry && !nativeControl) {
    event.preventDefault(); spaceDown = true;
    if (activeStroke) finishActiveStroke(false);
    drawHeld = false; drawHoldPointerId = null;
    virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false;
    updateDrawHoldUI(); render();
  }
  if (textEntry) return;
  if (nativeControl && !modifiedShortcut && event.key !== 'Escape') return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault(); $('#save').click(); return;
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); if (event.shiftKey) { if (doc.redo()) { changed(); renderLayers(); } } else if (doc.undo()) { changed(); renderLayers(); }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); if (doc.redo()) { changed(); renderLayers(); }
  } else if (event.key.toLowerCase() === 'b') setTool('draw');
  else if (event.key.toLowerCase() === 'e') setTool('erase');
  else if (event.key.toLowerCase() === 'g') setTool('fill');
  else if (event.key.toLowerCase() === 'i') setTool('eyedropper');
  else if (event.key.toLowerCase() === 'm') setTool('select');
  else if (event.key === 'Escape') {
    if (selection) { selection = null; selectionStart = null; selectionPointerId = null; status('Selection cleared', 'neutral'); }
    if (activeStroke) finishActiveStroke(false);
    drawHeld = false; drawHoldPointerId = null;
    virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false;
    if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); }
    updateDrawHoldUI(); render();
  }
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false; });
window.addEventListener('blur', () => {
  spaceDown = false; drawHeld = false; drawHoldPointerId = null;
  if (activeStroke) finishActiveStroke(false);
  virtualCursorPointerId = null; virtualCursorPoint = null; virtualCursorVisible = false; updateDrawHoldUI();
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); }
  render();
});
async function boot() {
  resizeCanvas();
  try {
    const saved = await loadMostRecentProject();
    if (saved) { doc = RasterDocument.fromJSON(saved); status('Recovered latest local project', 'success'); }
    else status('Ready · saved locally on this device', 'success');
  } catch (error) { status(`Local recovery unavailable: ${error.message}`, 'warning'); }
  fitCanvas(); updateTitle(); renderLayers();
}
boot();
