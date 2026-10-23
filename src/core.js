export const MAX_DIMENSION = 2048;
export const MAX_PIXELS = 4_194_304;
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

export function validateDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('Canvas dimensions must be positive integers.');
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new RangeError(`Canvas exceeds the initial safe limit (${MAX_DIMENSION} px per side / ${MAX_PIXELS.toLocaleString()} pixels).`);
  return { width, height };
}

export function screenToDocument(point, viewport, dimensions) {
  const x = Math.floor((point.x - viewport.panX) / viewport.zoom);
  const y = Math.floor((point.y - viewport.panY) / viewport.zoom);
  return { x, y, inside: x >= 0 && y >= 0 && x < dimensions.width && y < dimensions.height };
}

function makeLayer(id, name, width, height) {
  return { id, name, visible: true, opacity: 1, locked: false, pixels: new Uint8ClampedArray(width * height * 4) };
}
function clonePixels(pixels) { return new Uint8ClampedArray(pixels); }
function cloneLayer(layer) { return { ...layer, pixels: clonePixels(layer.pixels) }; }
const TILE_SIZE = 64;
function entryBytes(entry) {
  if (entry.type === 'pixels') return entry.tiles.reduce((sum, tile) => sum + tile.before.byteLength + tile.after.byteLength, 64);
  if (entry.type === 'layer-add') return (entry.addedLayer?.pixels.byteLength ?? 0) + 128;
  return 128;
}

export class RasterDocument {
  constructor(width = 128, height = 128, name = 'Untitled artwork') {
    validateDimensions(width, height);
    this.id = crypto.randomUUID();
    this.name = name;
    this.width = width;
    this.height = height;
    this.layers = [makeLayer(crypto.randomUUID(), 'Layer 1', width, height)];
    this.compositeCache = new Uint8ClampedArray(width * height * 4);
    this.compositeDirtyTiles = new Set();
    this.#markAllCompositeDirty();
    this.activeLayerId = this.layers[0].id;
    this.revision = 0;
    this.saveVersion = 0;
    this.history = [];
    this.future = [];
    this.maxHistory = 30;
    this.maxHistoryBytes = 64 * 1024 * 1024;
    this.historyBytes = 0;
    this.dirty = false;
  }
  get activeLayer() { return this.layers.find(layer => layer.id === this.activeLayerId) ?? this.layers[0]; }
  addLayer(name = `Layer ${this.layers.length + 1}`) {
    if (this.layers.length >= 64) throw new RangeError('The initial editor supports up to 64 layers.');
    if ((this.layers.length + 1) * this.width * this.height * 4 > MAX_DOCUMENT_BYTES) throw new RangeError('Adding this layer would exceed the 64 MiB total pixel-memory budget for this document size. Reduce the canvas dimensions or use fewer layers.');
    const layer = makeLayer(crypto.randomUUID(), name, this.width, this.height);
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    this.#record({ type: 'layer-add', index: this.layers.length - 1, beforeActive: this.layers[this.layers.length - 2]?.id, addedLayer: cloneLayer(layer) });
    return layer;
  }
  setActiveLayer(id) {
    if (!this.layers.some(layer => layer.id === id)) throw new Error('Unknown layer ID.');
    if (this.activeLayerId !== id) { this.activeLayerId = id; this.dirty = true; }
  }
  setLayerVisibility(id, visible) {
    const layer = this.layers.find(item => item.id === id);
    if (!layer) throw new Error('Unknown layer ID.');
    if (layer.visible === Boolean(visible)) return;
    const before = layer.visible;
    layer.visible = Boolean(visible);
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-visibility', layerId: id, before, after: layer.visible });
  }
  beginStroke({ color = '#20202a', size = 1, mode = 'draw' } = {}) {
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    if (!Number.isFinite(size) || size < 1 || size > 128) throw new RangeError('Brush size must be between 1 and 128 pixels.');
    if (!['draw', 'erase'].includes(mode)) throw new Error('Unsupported stroke mode.');
    return { layerId: layer.id, tilesBefore: new Map(), color: parseHexColor(color), size: Math.round(size), mode, last: null, changed: false };
  }
  strokeTo(stroke, x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError('Stroke coordinates must be integer document coordinates.');
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) throw new RangeError('Stroke coordinates are outside the document bounds.');
    const layer = this.layers.find(item => item.id === stroke.layerId);
    if (!layer) throw new Error('Stroke layer no longer exists.');
    const point = { x, y };
    if (!stroke.last) this.#dab(layer, point.x, point.y, stroke);
    else {
      const dx = point.x - stroke.last.x, dy = point.y - stroke.last.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.5));
      for (let i = 1; i <= steps; i++) this.#dab(layer, Math.round(stroke.last.x + dx * i / steps), Math.round(stroke.last.y + dy * i / steps), stroke);
    }
    stroke.last = point;
    stroke.changed = true;
  }
  endStroke(stroke, { commit = true } = {}) {
    const layer = this.layers.find(item => item.id === stroke.layerId);
    if (!layer) return false;
    if (!commit) { this.#restoreTiles(layer, stroke.tilesBefore); return false; }
    if (!stroke.changed || stroke.tilesBefore.size === 0) return false;
    const tiles = [...stroke.tilesBefore.entries()].map(([key, before]) => {
      const [tileX, tileY] = key.split(':').map(Number);
      return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
    });
    this.#record({ type: 'pixels', layerId: layer.id, tiles });
    return true;
  }
  getCompositeDirtyTiles() {
    return [...this.compositeDirtyTiles].map(key => {
      const [tileX, tileY] = key.split(':').map(Number);
      return { tileX, tileY, width: Math.min(TILE_SIZE, this.width - tileX * TILE_SIZE), height: Math.min(TILE_SIZE, this.height - tileY * TILE_SIZE) };
    });
  }
  clearCompositeDirtyTiles() { this.compositeDirtyTiles.clear(); }
  composite() {
    for (const key of this.compositeDirtyTiles) {
      const [tileX, tileY] = key.split(':').map(Number);
      const startX = tileX * TILE_SIZE, startY = tileY * TILE_SIZE;
      const width = Math.min(TILE_SIZE, this.width - startX), height = Math.min(TILE_SIZE, this.height - startY);
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const x = startX + col, y = startY + row, i = (y * this.width + x) * 4;
        let red = 0, green = 0, blue = 0, alpha = 0;
        for (const layer of this.layers) {
          if (!layer.visible || layer.opacity <= 0) continue;
          const sa = layer.pixels[i + 3] / 255 * Math.max(0, Math.min(1, layer.opacity));
          if (sa <= 0) continue;
          const oa = sa + alpha * (1 - sa);
          if (oa <= 0) continue;
          red = (layer.pixels[i] * sa + red * alpha * (1 - sa)) / oa;
          green = (layer.pixels[i + 1] * sa + green * alpha * (1 - sa)) / oa;
          blue = (layer.pixels[i + 2] * sa + blue * alpha * (1 - sa)) / oa;
          alpha = oa;
        }
        this.compositeCache[i] = Math.round(red);
        this.compositeCache[i + 1] = Math.round(green);
        this.compositeCache[i + 2] = Math.round(blue);
        this.compositeCache[i + 3] = Math.round(alpha * 255);
      }
    }
    return this.compositeCache;
  }
  undo() {
    const entry = this.history.pop();
    if (!entry) return false;
    this.#applyEntry(entry, false);
    this.#markAllCompositeDirty();
    this.future.push(entry);
    this.revision++;
    this.saveVersion++;
    this.dirty = true;
    return true;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.#applyEntry(entry, true);
    this.#markAllCompositeDirty();
    this.history.push(entry);
    this.revision++;
    this.dirty = true;
    return true;
  }
  toJSON() {
    return { format: 'pixelforge-project', version: 1, id: this.id, name: this.name, width: this.width, height: this.height, activeLayerId: this.activeLayerId, revision: this.revision,
      layers: this.layers.map(layer => ({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked, pixels: bytesToBase64(layer.pixels) })) };
  }
  static fromJSON(data) {
    if (!data || data.format !== 'pixelforge-project' || data.version !== 1 || !Array.isArray(data.layers)) throw new TypeError('Unsupported or invalid PixelForge project file.');
    validateDimensions(data.width, data.height);
    if (data.layers.length < 1 || data.layers.length > 64) throw new RangeError('Project layer count is outside the supported limit.');
    if (data.width * data.height * 4 * data.layers.length > MAX_DOCUMENT_BYTES) throw new RangeError('Project exceeds the 64 MiB total pixel-memory budget.');
    const projectName = typeof data.name === 'string' ? data.name.trim().slice(0, 180) : '';
    const doc = new RasterDocument(data.width, data.height, projectName || 'Imported project');
    if (data.id !== undefined && (typeof data.id !== 'string' || !data.id || data.id.length > 180)) throw new TypeError('Invalid project ID.');
    doc.id = typeof data.id === 'string' ? data.id : doc.id;
    const layerIds = new Set();
    doc.layers = data.layers.map((item, index) => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 180 || typeof item.name !== 'string') throw new TypeError('Invalid layer metadata.');
      if ((item.visible !== undefined && typeof item.visible !== 'boolean') || (item.locked !== undefined && typeof item.locked !== 'boolean')) throw new TypeError('Layer visibility and lock flags must be booleans.');
      if (layerIds.has(item.id)) throw new TypeError('Project contains duplicate layer IDs.');
      layerIds.add(item.id);
      const opacity = Number(item.opacity ?? 1);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Layer opacity must be between 0 and 1.');
      const pixels = base64ToBytes(item.pixels);
      if (pixels.length !== data.width * data.height * 4) throw new RangeError('Layer pixel data length does not match document dimensions.');
      return { id: item.id, name: item.name.trim().slice(0, 180) || `Layer ${index + 1}`, visible: item.visible !== false, opacity, locked: Boolean(item.locked), pixels };
    });
    doc.compositeCache = new Uint8ClampedArray(doc.width * doc.height * 4);
    doc.compositeDirtyTiles = new Set();
    doc.#markAllCompositeDirty();
    if (data.activeLayerId !== undefined && (typeof data.activeLayerId !== 'string' || !doc.layers.some(layer => layer.id === data.activeLayerId))) throw new TypeError('Active layer ID does not match a project layer.');
    if (data.revision !== undefined && (!Number.isInteger(data.revision) || data.revision < 0)) throw new RangeError('Document revision must be a non-negative integer.');
    if (data.saveVersion !== undefined && (!Number.isInteger(data.saveVersion) || data.saveVersion < 0)) throw new RangeError('Save version must be a non-negative integer.');
    doc.activeLayerId = data.activeLayerId ?? doc.layers[0].id;
    doc.revision = data.revision ?? 0;
    doc.saveVersion = data.saveVersion ?? doc.revision;
    doc.history = []; doc.future = []; doc.historyBytes = 0; doc.dirty = false;
    return doc;
  }
  #dab(layer, x, y, stroke) {
    const offset = Math.floor((stroke.size - 1) / 2);
    const minX = Math.max(0, x - offset), maxX = Math.min(this.width - 1, x - offset + stroke.size - 1);
    const minY = Math.max(0, y - offset), maxY = Math.min(this.height - 1, y - offset + stroke.size - 1);
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!stroke.tilesBefore.has(key)) stroke.tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      const i = (py * this.width + px) * 4;
      this.compositeDirtyTiles.add(key);
      if (stroke.mode === 'erase') layer.pixels[i + 3] = 0;
      else { layer.pixels[i] = stroke.color[0]; layer.pixels[i + 1] = stroke.color[1]; layer.pixels[i + 2] = stroke.color[2]; layer.pixels[i + 3] = 255; }
    }
  }
  #record(entry) {
    this.historyBytes -= this.future.reduce((sum, item) => sum + entryBytes(item), 0);
    this.future.length = 0;
    this.history.push(entry);
    this.historyBytes += entryBytes(entry);
    while (this.history.length > this.maxHistory || (this.historyBytes > this.maxHistoryBytes && this.history.length > 1)) {
      const removed = this.history.shift();
      this.historyBytes -= entryBytes(removed);
    }
    this.revision++;
    this.dirty = true;
  }
  #captureTile(layer, tileX, tileY) {
    const tile = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    const startX = tileX * TILE_SIZE, startY = tileY * TILE_SIZE;
    const width = Math.min(TILE_SIZE, this.width - startX), height = Math.min(TILE_SIZE, this.height - startY);
    for (let row = 0; row < height; row++) {
      const sourceStart = ((startY + row) * this.width + startX) * 4;
      tile.set(layer.pixels.subarray(sourceStart, sourceStart + width * 4), row * TILE_SIZE * 4);
    }
    return tile;
  }
  #markAllCompositeDirty() {
    for (let y = 0; y < this.height; y += TILE_SIZE) for (let x = 0; x < this.width; x += TILE_SIZE) this.compositeDirtyTiles.add(`${Math.floor(x / TILE_SIZE)}:${Math.floor(y / TILE_SIZE)}`);
  }
  #restoreTiles(layer, tiles) {
    for (const [key, pixels] of tiles) {
      const [tileX, tileY] = key.split(':').map(Number);
      this.#writeTile(layer, tileX, tileY, pixels);
    }
  }
  #writeTile(layer, tileX, tileY, tile) {
    this.compositeDirtyTiles.add(`${tileX}:${tileY}`);
    const startX = tileX * TILE_SIZE, startY = tileY * TILE_SIZE;
    const width = Math.min(TILE_SIZE, this.width - startX), height = Math.min(TILE_SIZE, this.height - startY);
    for (let row = 0; row < height; row++) {
      const targetStart = ((startY + row) * this.width + startX) * 4;
      layer.pixels.set(tile.subarray(row * TILE_SIZE * 4, row * TILE_SIZE * 4 + width * 4), targetStart);
    }
  }
  #applyEntry(entry, forward) {
    if (entry.type === 'pixels') {
      const layer = this.layers.find(item => item.id === entry.layerId);
      if (layer) for (const tile of entry.tiles) this.#writeTile(layer, tile.tileX, tile.tileY, forward ? tile.after : tile.before);
    } else if (entry.type === 'layer-visibility') {
      const layer = this.layers.find(item => item.id === entry.layerId);
      if (layer) layer.visible = forward ? entry.after : entry.before;
    } else if (entry.type === 'layer-add') {
      if (forward) {
        const existing = this.layers.find(layer => layer.id === entry.addedLayer?.id);
        if (!existing && entry.addedLayer) this.layers.splice(Math.min(entry.index, this.layers.length), 0, cloneLayer(entry.addedLayer));
        this.activeLayerId = entry.addedLayer?.id ?? this.activeLayerId;
      } else {
        this.layers = this.layers.filter(layer => layer.id !== entry.addedLayer?.id);
        this.activeLayerId = entry.beforeActive ?? this.layers[0].id;
      }
    }
  }
}

export function parseHexColor(value) {
  const hex = String(value).trim().replace(/^#/, '');
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) throw new TypeError('Color must be a valid 3- or 6-digit hex value.');
  const full = hex.length === 3 ? [...hex].map(ch => ch + ch).join('') : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length > 24_000_000) throw new TypeError('Invalid or oversized layer data.');
  let binary;
  try { binary = atob(value); } catch { throw new TypeError('Invalid base64 pixel data.'); }
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
