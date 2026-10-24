export const MAX_DIMENSION = 2048;
export const MAX_PIXELS = 4_194_304;
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

export function validateDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('Canvas dimensions must be positive integers.');
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new RangeError(`Canvas exceeds the initial safe limit (${MAX_DIMENSION} px per side / ${MAX_PIXELS.toLocaleString()} pixels).`);
  return { width, height };
}

export function rasterLinePoints(x0, y0, x1, y1) {
  if (![x0, y0, x1, y1].every(Number.isInteger)) throw new TypeError('Line coordinates must be integers.');
  const points = [], dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy, x = x0, y = y0;
  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

export function createColorSelectionMask(width, height, pixels, x, y, { tolerance = 0, contiguous = true } = {}) {
  validateDimensions(width, height);
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) throw new TypeError('Color selection pixels must match document dimensions.');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw new RangeError('Color selection point is outside document bounds.');
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255 || typeof contiguous !== 'boolean') throw new RangeError('Color selection tolerance/mode is invalid.');
  const offset = (y * width + x) * 4, seed = [...pixels.subarray(offset, offset + 4)];
  const matches = index => {
    if (seed[3] === 0 && pixels[index + 3] === 0) return true;
    for (let channel = 0; channel < 4; channel++) if (Math.abs(pixels[index + channel] - seed[channel]) > tolerance) return false;
    return true;
  };
  const mask = new Uint8Array(width * height);
  if (!contiguous) {
    for (let pixel = 0; pixel < mask.length; pixel++) if (matches(pixel * 4)) mask[pixel] = 1;
    return mask;
  }
  const queue = new Int32Array(width * height); let head = 0, tail = 0;
  const start = y * width + x; queue[tail++] = start; mask[start] = 1;
  while (head < tail) {
    const pixel = queue[head++], px = pixel % width, py = Math.floor(pixel / width);
    const add = next => {
      if (next < 0 || next >= mask.length || mask[next] || !matches(next * 4)) return;
      mask[next] = 1; queue[tail++] = next;
    };
    if (px > 0) add(pixel - 1);
    if (px + 1 < width) add(pixel + 1);
    if (py > 0) add(pixel - width);
    if (py + 1 < height) add(pixel + width);
  }
  return mask;
}

export function createSelectionMask(width, height, selection) {
  validateDimensions(width, height);
  if (selection === null) return null;
  if (!selection || ![selection.x, selection.y, selection.width, selection.height].every(Number.isInteger) ||
      selection.width < 1 || selection.height < 1 || !['rect', 'ellipse', 'polygon'].includes(selection.shape ?? 'rect')) {
    throw new TypeError('Selection must have integer bounds and a supported rect/ellipse/polygon shape.');
  }
  if (selection.shape === 'polygon' && (!Array.isArray(selection.points) || selection.points.length < 3 || selection.points.length > 4096 ||
      selection.points.some(point => !point || !Number.isInteger(point.x) || !Number.isInteger(point.y)))) {
    throw new TypeError('Polygon selection requires 3–4096 integer points.');
  }
  const mask = new Uint8Array(width * height);
  const left = Math.max(0, selection.x), top = Math.max(0, selection.y);
  const right = Math.min(width, selection.x + selection.width), bottom = Math.min(height, selection.y + selection.height);
  if ((selection.shape ?? 'rect') === 'rect') {
    for (let y = top; y < bottom; y++) mask.fill(1, y * width + left, y * width + right);
  } else if (selection.shape === 'ellipse') {
    const cx = selection.x + (selection.width - 1) / 2, cy = selection.y + (selection.height - 1) / 2;
    const rx = Math.max(.5, (selection.width - 1) / 2), ry = Math.max(.5, (selection.height - 1) / 2);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) mask[y * width + x] = 1;
    }
  } else {
    const points = selection.points;
    const onSegment = (x, y, a, b) => {
      const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
      if (Math.abs(cross) > .5) return false;
      return x >= Math.min(a.x, b.x) - .5 && x <= Math.max(a.x, b.x) + .5 && y >= Math.min(a.y, b.y) - .5 && y <= Math.max(a.y, b.y) + .5;
    };
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if (onSegment(x, y, a, b)) { inside = true; break; }
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) mask[y * width + x] = 1;
    }
  }
  return mask;
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
  if (entry.type === 'layer-delete') return (entry.removedLayer?.pixels.byteLength ?? 0) + 128;
  return 128;
}

export class RasterDocument {
  constructor(width = 128, height = 128, name = 'Untitled artwork') {
    validateDimensions(width, height);
    this.id = crypto.randomUUID();
    this.name = typeof name === 'string' ? name.trim().slice(0, 180) || 'Untitled artwork' : 'Untitled artwork';
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
    this.selectionMask = null;
  }
  setSelectionMask(mask) {
    if (mask === null) { this.selectionMask = null; return; }
    if (!(mask instanceof Uint8Array) || mask.length !== this.width * this.height) throw new TypeError('Selection mask must be a Uint8Array matching document dimensions.');
    this.selectionMask = new Uint8Array(mask);
  }
  get activeLayer() { return this.layers.find(layer => layer.id === this.activeLayerId) ?? this.layers[0]; }
  addLayer(name = `Layer ${this.layers.length + 1}`) {
    if (typeof name !== 'string' || !name.trim() || name.length > 180) throw new TypeError('Layer name must contain 1–180 characters.');
    name = name.trim();
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
    if (this.activeLayerId !== id) { this.activeLayerId = id; this.dirty = true; this.saveVersion++; }
  }
  moveLayer(id, targetIndex) {
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.layers.length) throw new RangeError('Layer target index is outside the layer stack.');
    const beforeIndex = this.layers.findIndex(layer => layer.id === id);
    if (beforeIndex < 0) throw new Error('Unknown layer ID.');
    if (beforeIndex === targetIndex) return false;
    const [layer] = this.layers.splice(beforeIndex, 1);
    this.layers.splice(targetIndex, 0, layer);
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-move', layerId: id, beforeIndex, afterIndex: targetIndex });
    return true;
  }
  renameLayer(id, name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 180) throw new TypeError('Layer name must contain 1–180 characters.');
    const layer = this.layers.find(item => item.id === id);
    if (!layer) throw new Error('Unknown layer ID.');
    const after = name.trim();
    if (layer.name === after) return false;
    const before = layer.name;
    layer.name = after;
    this.#record({ type: 'layer-rename', layerId: id, before, after });
    return true;
  }
  setLayerOpacity(id, opacity) {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Layer opacity must be between 0 and 1.');
    const layer = this.layers.find(item => item.id === id);
    if (!layer) throw new Error('Unknown layer ID.');
    if (layer.opacity === opacity) return false;
    const before = layer.opacity;
    layer.opacity = opacity;
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-opacity', layerId: id, before, after: opacity });
    return true;
  }
  duplicateLayer(id, name) {
    const sourceIndex = this.layers.findIndex(item => item.id === id);
    if (sourceIndex < 0) throw new Error('Unknown layer ID.');
    if (this.layers.length >= 64) throw new RangeError('The initial editor supports up to 64 layers.');
    if ((this.layers.length + 1) * this.width * this.height * 4 > MAX_DOCUMENT_BYTES) throw new RangeError('Duplicating this layer would exceed the 64 MiB total pixel-memory budget.');
    const source = this.layers[sourceIndex];
    const duplicate = cloneLayer(source);
    duplicate.id = crypto.randomUUID();
    duplicate.name = typeof name === 'string' && name.trim() ? name.trim().slice(0, 180) : `${source.name} copy`.slice(0, 180);
    this.layers.splice(sourceIndex + 1, 0, duplicate);
    const beforeActive = this.activeLayerId;
    this.activeLayerId = duplicate.id;
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-add', index: sourceIndex + 1, beforeActive, addedLayer: cloneLayer(duplicate) });
    return duplicate;
  }
  deleteLayer(id) {
    if (this.layers.length <= 1) throw new RangeError('A document must keep at least one layer.');
    const index = this.layers.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Unknown layer ID.');
    const beforeActive = this.activeLayerId;
    const [removedLayer] = this.layers.splice(index, 1);
    if (this.activeLayerId === id) this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)].id;
    const afterActive = this.activeLayerId;
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-delete', index, beforeActive, afterActive, removedLayer: cloneLayer(removedLayer) });
    return removedLayer;
  }
  setLayerLocked(id, locked) {
    if (typeof locked !== 'boolean') throw new TypeError('Layer lock must be a boolean.');
    const layer = this.layers.find(item => item.id === id);
    if (!layer) throw new Error('Unknown layer ID.');
    if (layer.locked === locked) return;
    const before = layer.locked;
    layer.locked = locked;
    this.#record({ type: 'layer-lock', layerId: id, before, after: locked });
  }
  setLayerVisibility(id, visible) {
    if (typeof visible !== 'boolean') throw new TypeError('Layer visibility must be a boolean.');
    const layer = this.layers.find(item => item.id === id);
    if (!layer) throw new Error('Unknown layer ID.');
    if (layer.visible === Boolean(visible)) return;
    const before = layer.visible;
    layer.visible = visible;
    this.#markAllCompositeDirty();
    this.#record({ type: 'layer-visibility', layerId: id, before, after: layer.visible });
  }
  beginStroke({ color = '#20202a', size = 1, mode = 'draw', opacity = 1 } = {}) {
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    if (!Number.isFinite(size) || size < 1 || size > 128) throw new RangeError('Brush size must be between 1 and 128 pixels.');
    if (!['draw', 'erase'].includes(mode)) throw new Error('Unsupported stroke mode.');
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Stroke opacity must be between 0 and 1.');
    return { layerId: layer.id, tilesBefore: new Map(), color: parseHexColor(color), size: Math.round(size), mode, opacity, last: null, changed: false };
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
  fillAt(x, y, { color = '#20202a', tolerance = 0, contiguous = true, pattern = 'solid', secondaryColor = '#ffffff', scale = 1 } = {}) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new RangeError('Fill coordinates are outside the document bounds.');
    }
    if (typeof contiguous !== 'boolean') throw new TypeError('Fill mode must be contiguous or global.');
    if (!['solid', 'checker'].includes(pattern)) throw new TypeError('Fill pattern must be solid or checker.');
    if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new RangeError('Dither scale must be an integer from 1 to 16.');
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) throw new RangeError('Fill tolerance must be an integer from 0 to 255.');
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    const replacement = [...parseHexColor(color), 255], secondary = [...parseHexColor(secondaryColor), 255];
    const seedOffset = (y * this.width + x) * 4;
    const seed = Array.from(layer.pixels.subarray(seedOffset, seedOffset + 4));
    const matches = index => {
      // RGB values under zero alpha are invisible and must not split a transparent fill region.
      if (seed[3] === 0 && layer.pixels[index + 3] === 0) return true;
      for (let channel = 0; channel < 4; channel++) {
        if (Math.abs(layer.pixels[index + channel] - seed[channel]) > tolerance) return false;
      }
      return true;
    };
    if (pattern === 'solid' && tolerance === 0 && seed.every((value, channel) => value === replacement[channel])) return 0;
    const tilesBefore = new Map();
    const paint = index => {
      const pixel = index / 4;
      if (this.selectionMask && !this.selectionMask[pixel]) return false;
      if (!matches(index)) return false;
      const px = pixel % this.width, py = Math.floor(pixel / this.width);
      const pixelReplacement = pattern === 'checker' && (Math.floor(px / scale) + Math.floor(py / scale)) % 2 === 1 ? secondary : replacement;
      if (pixelReplacement.every((value, channel) => layer.pixels[index + channel] === value)) return false;
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!tilesBefore.has(key)) tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      for (let channel = 0; channel < 4; channel++) layer.pixels[index + channel] = pixelReplacement[channel];
      this.compositeDirtyTiles.add(key);
      return true;
    };
    let changedPixels = 0;
    if (!contiguous) {
      for (let index = 0; index < layer.pixels.length; index += 4) if (paint(index)) changedPixels++;
    } else {
      // Bounded typed buffers ensure each document pixel is visited at most once.
      const pixelCount = this.width * this.height;
      const queue = new Int32Array(pixelCount), visited = new Uint8Array(pixelCount);
      let head = 0, tail = 0;
      const start = y * this.width + x;
      queue[tail++] = start; visited[start] = 1;
      while (head < tail) {
        const pixel = queue[head++], index = pixel * 4;
        if (matches(index) && paint(index)) changedPixels++;
        const px = pixel % this.width, py = Math.floor(pixel / this.width);
        const enqueue = neighbor => {
          if (neighbor < 0 || neighbor >= pixelCount || visited[neighbor]) return;
          visited[neighbor] = 1;
          if (matches(neighbor * 4)) queue[tail++] = neighbor;
        };
        if (px > 0) enqueue(pixel - 1);
        if (px + 1 < this.width) enqueue(pixel + 1);
        if (py > 0) enqueue(pixel - this.width);
        if (py + 1 < this.height) enqueue(pixel + this.width);
      }
    }
    if (changedPixels > 0) {
      const tiles = [...tilesBefore.entries()].map(([key, before]) => {
        const [tileX, tileY] = key.split(':').map(Number);
        return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
      });
      this.#record({ type: 'pixels', layerId: layer.id, tiles });
    }
    return changedPixels;
  }
  clearRect(x, y, width, height) {
    if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1) throw new RangeError('Clear rectangle coordinates and dimensions must be positive integers.');
    const left = Math.max(0, x), top = Math.max(0, y);
    const right = Math.min(this.width, x + width), bottom = Math.min(this.height, y + height);
    if (left >= right || top >= bottom) return 0;
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    const tilesBefore = new Map();
    let changedPixels = 0;
    for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
      const pixelIndex = py * this.width + px;
      if (this.selectionMask && !this.selectionMask[pixelIndex]) continue;
      const index = pixelIndex * 4;
      if (layer.pixels[index + 3] === 0 && layer.pixels[index] === 0 && layer.pixels[index + 1] === 0 && layer.pixels[index + 2] === 0) continue;
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!tilesBefore.has(key)) tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      layer.pixels[index] = 0; layer.pixels[index + 1] = 0; layer.pixels[index + 2] = 0; layer.pixels[index + 3] = 0;
      this.compositeDirtyTiles.add(key); changedPixels++;
    }
    if (changedPixels) {
      const tiles = [...tilesBefore.entries()].map(([key, before]) => {
        const [tileX, tileY] = key.split(':').map(Number);
        return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
      });
      this.#record({ type: 'pixels', layerId: layer.id, tiles });
    }
    return changedPixels;
  }
  createOutline(color = '#20202a', { diagonals = true } = {}) {
    if (typeof diagonals !== 'boolean') throw new TypeError('Outline diagonal mode must be a boolean.');
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    const rgb = parseHexColor(color), source = new Uint8ClampedArray(layer.pixels);
    const neighbors = diagonals ? [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] : [[0,-1],[-1,0],[1,0],[0,1]];
    const tilesBefore = new Map();
    let changedPixels = 0;
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const sourceIndex = (y * this.width + x) * 4;
      if (source[sourceIndex + 3] === 0) continue;
      for (const [dx, dy] of neighbors) {
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const pixel = py * this.width + px;
        if (this.selectionMask && !this.selectionMask[pixel]) continue;
        const index = pixel * 4;
        if (source[index + 3] !== 0 || layer.pixels[index + 3] !== 0) continue;
        const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
        if (!tilesBefore.has(key)) tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
        layer.pixels[index] = rgb[0]; layer.pixels[index + 1] = rgb[1]; layer.pixels[index + 2] = rgb[2]; layer.pixels[index + 3] = 255;
        this.compositeDirtyTiles.add(key); changedPixels++;
      }
    }
    if (changedPixels) {
      const tiles = [...tilesBefore.entries()].map(([key, before]) => {
        const [tileX, tileY] = key.split(':').map(Number);
        return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
      });
      this.#record({ type: 'pixels', layerId: layer.id, tiles });
    }
    return changedPixels;
  }
  flipRect(x, y, width, height, axis = 'horizontal') {
    if (!['horizontal', 'vertical'].includes(axis)) throw new TypeError('Flip axis must be horizontal or vertical.');
    const clipboard = this.copyRect(x, y, width, height);
    const pixels = new Uint8ClampedArray(clipboard.pixels.length);
    for (let dy = 0; dy < clipboard.height; dy++) for (let dx = 0; dx < clipboard.width; dx++) {
      const sourceX = axis === 'horizontal' ? clipboard.width - 1 - dx : dx;
      const sourceY = axis === 'vertical' ? clipboard.height - 1 - dy : dy;
      const sourceOffset = (sourceY * clipboard.width + sourceX) * 4;
      const targetOffset = (dy * clipboard.width + dx) * 4;
      pixels.set(clipboard.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
    return this.pasteRect({ ...clipboard, pixels }, { x: clipboard.x, y: clipboard.y });
  }
  replaceColor(sourceColor, targetColor, tolerance = 0) {
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) throw new RangeError('Color replacement tolerance must be an integer from 0 to 255.');
    const source = parseHexColor(sourceColor), target = parseHexColor(targetColor), layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    if (source.every((value, index) => value === target[index]) && tolerance === 0) return 0;
    const tilesBefore = new Map();
    let changedPixels = 0;
    for (let index = 0; index < layer.pixels.length; index += 4) {
      const pixel = index / 4;
      if (this.selectionMask && !this.selectionMask[pixel]) continue;
      if (layer.pixels[index + 3] === 0) continue;
      if (Math.max(Math.abs(layer.pixels[index] - source[0]), Math.abs(layer.pixels[index + 1] - source[1]), Math.abs(layer.pixels[index + 2] - source[2])) > tolerance) continue;
      if (layer.pixels[index] === target[0] && layer.pixels[index + 1] === target[1] && layer.pixels[index + 2] === target[2]) continue;
      const px = pixel % this.width, py = Math.floor(pixel / this.width);
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!tilesBefore.has(key)) tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      layer.pixels[index] = target[0]; layer.pixels[index + 1] = target[1]; layer.pixels[index + 2] = target[2];
      this.compositeDirtyTiles.add(key); changedPixels++;
    }
    if (changedPixels) {
      const tiles = [...tilesBefore.entries()].map(([key, before]) => {
        const [tileX, tileY] = key.split(':').map(Number);
        return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
      });
      this.#record({ type: 'pixels', layerId: layer.id, tiles });
    }
    return changedPixels;
  }
  copyRect(x, y, width, height) {
    if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1) throw new RangeError('Copy rectangle coordinates and dimensions must be positive integers.');
    const left = Math.max(0, x), top = Math.max(0, y), right = Math.min(this.width, x + width), bottom = Math.min(this.height, y + height);
    if (left >= right || top >= bottom) throw new RangeError('Copy rectangle is outside document bounds.');
    const layer = this.activeLayer, pixels = new Uint8ClampedArray((right - left) * (bottom - top) * 4);
    for (let row = 0; row < bottom - top; row++) {
      for (let col = 0; col < right - left; col++) {
        const sourcePixel = (top + row) * this.width + left + col;
        if (this.selectionMask && !this.selectionMask[sourcePixel]) continue;
        const sourceOffset = sourcePixel * 4, targetOffset = (row * (right - left) + col) * 4;
        pixels.set(layer.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
    return { x: left, y: top, width: right - left, height: bottom - top, pixels };
  }
  pasteRect(clipboard, { x = clipboard?.x, y = clipboard?.y } = {}) {
    if (!clipboard || !Number.isInteger(clipboard.width) || !Number.isInteger(clipboard.height) || clipboard.width < 1 || clipboard.height < 1 ||
        !(clipboard.pixels instanceof Uint8ClampedArray) || clipboard.pixels.length !== clipboard.width * clipboard.height * 4 ||
        !Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError('Invalid internal pixel clipboard.');
    const layer = this.activeLayer;
    if (layer.locked) throw new Error('The active layer is locked.');
    const left = Math.max(0, x), top = Math.max(0, y), right = Math.min(this.width, x + clipboard.width), bottom = Math.min(this.height, y + clipboard.height);
    if (left >= right || top >= bottom) return 0;
    const tilesBefore = new Map();
    let changedPixels = 0;
    for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
      const docPixel = py * this.width + px;
      if (this.selectionMask && !this.selectionMask[docPixel]) continue;
      const srcX = px - x, srcY = py - y, srcOffset = (srcY * clipboard.width + srcX) * 4, dstOffset = docPixel * 4;
      let differs = false;
      for (let channel = 0; channel < 4; channel++) if (layer.pixels[dstOffset + channel] !== clipboard.pixels[srcOffset + channel]) { differs = true; break; }
      if (!differs) continue;
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!tilesBefore.has(key)) tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      layer.pixels.set(clipboard.pixels.subarray(srcOffset, srcOffset + 4), dstOffset);
      this.compositeDirtyTiles.add(key); changedPixels++;
    }
    if (changedPixels) {
      const tiles = [...tilesBefore.entries()].map(([key, before]) => {
        const [tileX, tileY] = key.split(':').map(Number);
        return { tileX, tileY, before, after: this.#captureTile(layer, tileX, tileY) };
      });
      this.#record({ type: 'pixels', layerId: layer.id, tiles });
    }
    return changedPixels;
  }
  sampleColorAt(x, y, { merged = true } = {}) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new RangeError('Sample coordinates are outside the document bounds.');
    }
    if (typeof merged !== 'boolean') throw new TypeError('Sample source must be merged or active layer.');
    const pixels = merged ? this.composite() : this.activeLayer.pixels;
    const offset = (y * this.width + x) * 4;
    if (pixels[offset + 3] === 0) return null;
    return '#' + [...pixels.subarray(offset, offset + 3)].map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
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
    this.saveVersion++;
    this.dirty = true;
    return true;
  }
  toJSON() {
    return { format: 'pixelforge-project', version: 1, id: this.id, name: this.name, width: this.width, height: this.height, activeLayerId: this.activeLayerId, revision: this.revision, saveVersion: this.saveVersion,
      layers: this.layers.map(layer => ({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked, pixels: bytesToBase64(layer.pixels) })) };
  }
  static fromJSON(data, { newIdentity = false } = {}) {
    if (!data || data.format !== 'pixelforge-project' || data.version !== 1 || !Array.isArray(data.layers)) throw new TypeError('Unsupported or invalid PixelForge project file.');
    validateDimensions(data.width, data.height);
    if (data.layers.length < 1 || data.layers.length > 64) throw new RangeError('Project layer count is outside the supported limit.');
    if (data.width * data.height * 4 * data.layers.length > MAX_DOCUMENT_BYTES) throw new RangeError('Project exceeds the 64 MiB total pixel-memory budget.');
    const projectName = typeof data.name === 'string' ? data.name.trim().slice(0, 180) : '';
    const doc = new RasterDocument(data.width, data.height, projectName || 'Imported project');
    if (newIdentity) doc.name = `${doc.name.slice(0, 169)} (imported)`;
    if (data.id !== undefined && (typeof data.id !== 'string' || !data.id || data.id.length > 180)) throw new TypeError('Invalid project ID.');
    if (!newIdentity && typeof data.id === 'string') doc.id = data.id;
    const layerIds = new Set(), layerIdMap = new Map();
    doc.layers = data.layers.map((item, index) => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 180 || typeof item.name !== 'string') throw new TypeError('Invalid layer metadata.');
      if ((item.visible !== undefined && typeof item.visible !== 'boolean') || (item.locked !== undefined && typeof item.locked !== 'boolean')) throw new TypeError('Layer visibility and lock flags must be booleans.');
      if (layerIds.has(item.id)) throw new TypeError('Project contains duplicate layer IDs.');
      layerIds.add(item.id);
      const newLayerId = newIdentity ? crypto.randomUUID() : item.id;
      layerIdMap.set(item.id, newLayerId);
      const opacity = Number(item.opacity ?? 1);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Layer opacity must be between 0 and 1.');
      const pixels = base64ToBytes(item.pixels);
      if (pixels.length !== data.width * data.height * 4) throw new RangeError('Layer pixel data length does not match document dimensions.');
      return { id: newLayerId, name: item.name.trim().slice(0, 180) || `Layer ${index + 1}`, visible: item.visible !== false, opacity, locked: Boolean(item.locked), pixels };
    });
    doc.compositeCache = new Uint8ClampedArray(doc.width * doc.height * 4);
    doc.compositeDirtyTiles = new Set();
    doc.#markAllCompositeDirty();
    if (data.activeLayerId !== undefined && (typeof data.activeLayerId !== 'string' || !layerIds.has(data.activeLayerId))) throw new TypeError('Active layer ID does not match a project layer.');
    if (data.revision !== undefined && (!Number.isInteger(data.revision) || data.revision < 0)) throw new RangeError('Document revision must be a non-negative integer.');
    if (data.saveVersion !== undefined && (!Number.isInteger(data.saveVersion) || data.saveVersion < 0)) throw new RangeError('Save version must be a non-negative integer.');
    doc.activeLayerId = data.activeLayerId === undefined ? doc.layers[0].id : (newIdentity ? layerIdMap.get(data.activeLayerId) : data.activeLayerId);
    doc.revision = newIdentity ? 0 : (data.revision ?? 0);
    doc.saveVersion = newIdentity ? 0 : (data.saveVersion ?? doc.revision);
    doc.history = []; doc.future = []; doc.historyBytes = 0; doc.dirty = false;
    return doc;
  }
  #dab(layer, x, y, stroke) {
    const offset = Math.floor((stroke.size - 1) / 2);
    const minX = Math.max(0, x - offset), maxX = Math.min(this.width - 1, x - offset + stroke.size - 1);
    const minY = Math.max(0, y - offset), maxY = Math.min(this.height - 1, y - offset + stroke.size - 1);
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const pixelIndex = py * this.width + px;
      if (this.selectionMask && !this.selectionMask[pixelIndex]) continue;
      if (stroke.opacity <= 0) continue;
      const i = pixelIndex * 4, next = [layer.pixels[i], layer.pixels[i + 1], layer.pixels[i + 2], layer.pixels[i + 3]];
      if (stroke.mode === 'erase') {
        next[3] = Math.round(next[3] * (1 - stroke.opacity));
        if (next[3] === 0) next[0] = next[1] = next[2] = 0;
      } else {
        const destinationAlpha = next[3] / 255, sourceAlpha = stroke.opacity;
        const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
        if (outputAlpha <= 0) continue;
        next[0] = Math.round((stroke.color[0] * sourceAlpha + next[0] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
        next[1] = Math.round((stroke.color[1] * sourceAlpha + next[1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
        next[2] = Math.round((stroke.color[2] * sourceAlpha + next[2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
        next[3] = Math.round(outputAlpha * 255);
      }
      if (next.every((value, channel) => value === layer.pixels[i + channel])) continue;
      const tileX = Math.floor(px / TILE_SIZE), tileY = Math.floor(py / TILE_SIZE), key = `${tileX}:${tileY}`;
      if (!stroke.tilesBefore.has(key)) stroke.tilesBefore.set(key, this.#captureTile(layer, tileX, tileY));
      layer.pixels.set(next, i);
      this.compositeDirtyTiles.add(key);
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
    this.saveVersion++;
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
    } else if (entry.type === 'layer-move') {
      const currentIndex = this.layers.findIndex(item => item.id === entry.layerId);
      if (currentIndex >= 0) {
        const [layer] = this.layers.splice(currentIndex, 1);
        const targetIndex = forward ? entry.afterIndex : entry.beforeIndex;
        this.layers.splice(Math.min(targetIndex, this.layers.length), 0, layer);
        this.#markAllCompositeDirty();
      }
    } else if (entry.type === 'layer-rename') {
      const layer = this.layers.find(item => item.id === entry.layerId);
      if (layer) layer.name = forward ? entry.after : entry.before;
    } else if (entry.type === 'layer-opacity') {
      const layer = this.layers.find(item => item.id === entry.layerId);
      if (layer) layer.opacity = forward ? entry.after : entry.before;
      this.#markAllCompositeDirty();
    } else if (entry.type === 'layer-delete') {
      if (forward) {
        this.layers = this.layers.filter(layer => layer.id !== entry.removedLayer?.id);
        this.activeLayerId = entry.afterActive ?? this.layers[0]?.id;
      } else {
        const existing = this.layers.find(layer => layer.id === entry.removedLayer?.id);
        if (!existing && entry.removedLayer) this.layers.splice(Math.min(entry.index, this.layers.length), 0, cloneLayer(entry.removedLayer));
        this.activeLayerId = entry.beforeActive ?? this.layers[0]?.id;
      }
      this.#markAllCompositeDirty();
    } else if (entry.type === 'layer-lock') {
      const layer = this.layers.find(item => item.id === entry.layerId);
      if (layer) layer.locked = forward ? entry.after : entry.before;
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
