import { RasterDocument, screenToDocument, validateDimensions } from './core.js';
import { loadMostRecentProject, saveProject } from './persistence.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#canvas'), ctx = canvas.getContext('2d', { alpha: true });
const workArea = $('#work-area');
const previewCanvas = document.createElement('canvas'), previewCtx = previewCanvas.getContext('2d', { alpha: true });
let doc = new RasterDocument(128, 128), tool = 'draw', spaceDown = false;
let color = $('#color').value, brushSize = Number($('#brush-size').value);
let zoom = 3, panX = 0, panY = 0, activeStroke = null, pointerId = null;
let panning = false, panStart = null, autosaveTimer = null, renderQueued = false;

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
  zoom = Math.max(.1, Math.min(12, Math.floor(Math.min((rect.width - 80) / doc.width, (rect.height - 80) / doc.height) * 2) / 2));
  if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1;
  panX = (rect.width - doc.width * zoom) / 2;
  panY = (rect.height - doc.height * zoom) / 2;
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
      previewCanvas.width = doc.width; previewCanvas.height = doc.height;
    }
    previewCtx.putImageData(new ImageData(doc.composite(), doc.width, doc.height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#20232d';
    ctx.fillRect(panX - 1, panY - 1, doc.width * zoom + 2, doc.height * zoom + 2);
    ctx.drawImage(previewCanvas, panX, panY, doc.width * zoom, doc.height * zoom);
    ctx.strokeStyle = '#555b6c'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(panX) + .5, Math.round(panY) + .5, Math.round(doc.width * zoom), Math.round(doc.height * zoom));
    $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  });
}
function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function docPoint(event) { return screenToDocument(eventPoint(event), { zoom, panX, panY }, doc); }
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  status('Unsaved changes', 'warning');
  autosaveTimer = setTimeout(async () => {
    autosaveTimer = null;
    try {
      await saveProject(doc.toJSON()); doc.dirty = false;
      status('Saved on this device', 'success'); updateTitle();
    } catch (error) { status(`Autosave unavailable: ${error.message}`, 'error'); }
  }, 800);
}
async function flushAutosave() {
  if (activeStroke) endStroke({ pointerId }, false);
  const pending = autosaveTimer !== null;
  if (pending) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  if (!doc.dirty && !pending) return;
  await saveProject(doc.toJSON()); doc.dirty = false; updateTitle();
}
function changed() { render(); updateTitle(); scheduleAutosave(); }
function beginStroke(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const point = docPoint(event);
  if (!point.inside) return;
  try {
    activeStroke = doc.beginStroke({ color, size: brushSize, mode: tool });
    pointerId = event.pointerId; canvas.setPointerCapture?.(event.pointerId);
    doc.strokeTo(activeStroke, point.x, point.y); render();
  } catch (error) { status(error.message, 'error'); }
}
function moveStroke(event) {
  if (panning && panStart) {
    const p = eventPoint(event);
    panX = panStart.panX + p.x - panStart.x; panY = panStart.panY + p.y - panStart.y;
    render(); return;
  }
  if (!activeStroke || event.pointerId !== pointerId) return;
  const point = docPoint(event);
  if (point.inside) doc.strokeTo(activeStroke, point.x, point.y);
  render();
}
function endStroke(event, commit = true) {
  if (!activeStroke || (event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
  doc.endStroke(activeStroke, { commit }); activeStroke = null; pointerId = null;
  if (commit) changed(); else render();
}
canvas.addEventListener('pointerdown', event => {
  if (tool === 'pan' || event.button === 1 || spaceDown) {
    panning = true;
    const p = eventPoint(event); panStart = { x: p.x, y: p.y, panX, panY };
    canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('is-panning');
    event.preventDefault(); return;
  }
  beginStroke(event);
});
canvas.addEventListener('pointermove', moveStroke);
canvas.addEventListener('pointerup', event => {
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); return; }
  endStroke(event, true);
});
canvas.addEventListener('pointercancel', event => {
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); }
  endStroke(event, false);
});
canvas.addEventListener('lostpointercapture', event => endStroke(event, false));
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const p = eventPoint(event), before = { x: (p.x - panX) / zoom, y: (p.y - panY) / zoom };
  zoom = Math.max(.25, Math.min(24, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
  panX = p.x - before.x * zoom; panY = p.y - before.y * zoom; render();
}, { passive: false });

$('#brush-tool').addEventListener('click', () => setTool('draw'));
$('#eraser-tool').addEventListener('click', () => setTool('erase'));
$('#pan-tool').addEventListener('click', () => setTool('pan'));
$('#layers-tab').addEventListener('click', () => $('#layers').scrollIntoView({ behavior: 'smooth', block: 'center' }));
function setTool(next) {
  if (activeStroke) endStroke({ pointerId }, false);
  tool = next;
  $('#brush-tool').classList.toggle('active', tool === 'draw');
  $('#eraser-tool').classList.toggle('active', tool === 'erase');
  $('#pan-tool').classList.toggle('active', tool === 'pan');
  $('#tool-label').textContent = tool === 'draw' ? 'Pencil' : tool === 'erase' ? 'Eraser' : 'Pan';
  canvas.dataset.tool = tool;
}
$('#color').addEventListener('input', event => {
  color = event.target.value; $('#color-value').textContent = color.toUpperCase();
  if (tool === 'erase') setTool('draw');
});
$('#brush-size').addEventListener('input', event => {
  brushSize = Number(event.target.value); $('#brush-size-value').textContent = `${brushSize} px`;
});
$('#undo').addEventListener('click', () => { if (doc.undo()) changed(); });
$('#redo').addEventListener('click', () => { if (doc.redo()) changed(); });
$('#fit').addEventListener('click', fitCanvas);
$('#zoom-in').addEventListener('click', () => { zoom = Math.min(24, zoom * 1.25); render(); });
$('#zoom-out').addEventListener('click', () => { zoom = Math.max(.25, zoom / 1.25); render(); });
$('#add-layer').addEventListener('click', () => {
  try { doc.addLayer(); changed(); renderLayers(); status('Layer added', 'success'); }
  catch (error) { status(error.message, 'error'); }
});
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
  try { await flushAutosave(); status('Saved on this device', 'success'); }
  catch (error) { status(`Save failed: ${error.message}`, 'error'); }
});
$('#export-project').addEventListener('click', () => downloadBlob(
  new Blob([JSON.stringify(doc.toJSON())], { type: 'application/json' }), `${safeName(doc.name)}.pforge`
));
$('#export-png').addEventListener('click', () => {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = doc.width; exportCanvas.height = doc.height;
  exportCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(doc.composite()), doc.width, doc.height), 0, 0);
  exportCanvas.toBlob(blob => {
    if (blob) downloadBlob(blob, `${safeName(doc.name)}.png`);
    else status('PNG export failed', 'error');
  }, 'image/png');
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 100 * 1024 * 1024) throw new RangeError('This file is larger than the 100 MiB import safety limit.');
    let importedDoc;
    if (file.name.toLowerCase().endsWith('.pforge') || file.type === 'application/json') {
      importedDoc = RasterDocument.fromJSON(JSON.parse(await file.text()));
    } else {
      const bitmap = await createImageBitmap(file);
      try {
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
    const select = document.createElement('button');
    select.className = 'layer-select'; select.textContent = layer.name; select.title = 'Select layer';
    select.addEventListener('click', () => { doc.setActiveLayer(layer.id); renderLayers(); updateTitle(); });
    const visibility = document.createElement('button');
    visibility.className = 'layer-visibility'; visibility.textContent = layer.visible ? '◉' : '○';
    visibility.setAttribute('aria-label', layer.visible ? 'Hide layer' : 'Show layer');
    visibility.addEventListener('click', () => { doc.setLayerVisibility(layer.id, !layer.visible); changed(); renderLayers(); });
    row.append(visibility, select); list.append(row);
  });
}
function safeName(value) { return (value || 'pixelforge-artwork').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pixelforge-artwork'; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault(); spaceDown = true;
    if (activeStroke) endStroke({ pointerId }, false);
  }
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); if (event.shiftKey) { if (doc.redo()) changed(); } else if (doc.undo()) changed();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); if (doc.redo()) changed();
  } else if (event.key.toLowerCase() === 'b') setTool('draw');
  else if (event.key.toLowerCase() === 'e') setTool('erase');
  else if (event.key === 'Escape' && activeStroke) endStroke({ pointerId }, false);
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false; });
window.addEventListener('blur', () => {
  spaceDown = false;
  if (activeStroke) endStroke({ pointerId }, false);
  if (panning) { panning = false; panStart = null; canvas.classList.remove('is-panning'); }
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
