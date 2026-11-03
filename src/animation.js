import { validateDimensions } from './core.js';

export const MIN_FRAME_DURATION_MS = 1;
export const MAX_FRAME_DURATION_MS = 60_000;
export const MAX_ANIMATION_FPS = 120;
export const MAX_ANIMATION_FRAMES = 1_000;
export const DEFAULT_ANIMATION_MEMORY_BUDGET = 256 * 1024 * 1024;

function makeId() { return globalThis.crypto.randomUUID(); }
function validateDuration(value) {
  if (!Number.isInteger(value) || value < MIN_FRAME_DURATION_MS || value > MAX_FRAME_DURATION_MS) throw new RangeError('Frame duration must be an integer from 1 to 60000 ms.');
  return value;
}
function validateName(value, label = 'Name') {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new TypeError(label + ' must be non-empty text of at most 120 characters.');
  return value.trim();
}

/** DOM-free animation data primitives. Editing commands/history and rendering are integrated by the host. */
export class AnimationTimeline {
  #width; #height; #layers; #frames = []; #tags = []; #selectedFrameId;
  #fps; #loop; #revision = 0; #maxFrames; #maxBytes;

  constructor({ width, height, layers = [{ id: 'layer-1', name: 'Layer 1' }], fps = 12, loop = true,
    durationMs = 100, maxFrames = MAX_ANIMATION_FRAMES, maxBytes = DEFAULT_ANIMATION_MEMORY_BUDGET } = {}) {
    validateDimensions(width, height);
    if (!Array.isArray(layers) || layers.length < 1 || layers.length > 256) throw new RangeError('An animation requires between 1 and 256 layers.');
    if (!Number.isInteger(fps) || fps < 1 || fps > MAX_ANIMATION_FPS) throw new RangeError('FPS must be an integer from 1 to 120.');
    if (typeof loop !== 'boolean') throw new TypeError('Loop must be a boolean.');
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > MAX_ANIMATION_FRAMES) throw new RangeError('maxFrames must be from 1 to 1000.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < width * height * 4) throw new RangeError('Animation memory budget is too small or invalid.');
    const ids = new Set();
    this.#layers = layers.map(layer => {
      if (!layer || typeof layer.id !== 'string' || !layer.id.trim() || ids.has(layer.id)) throw new TypeError('Layer IDs must be unique, non-empty strings.');
      ids.add(layer.id);
      return { id: layer.id, name: validateName(layer.name, 'Layer name') };
    });
    this.#width = width; this.#height = height; this.#fps = fps; this.#loop = loop;
    this.#maxFrames = maxFrames; this.#maxBytes = maxBytes;
    this.#frames.push(this.#makeFrame({ durationMs }));
    this.#selectedFrameId = this.#frames[0].id;
  }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get fps() { return this.#fps; }
  get loop() { return this.#loop; }
  get revision() { return this.#revision; }
  get frameCount() { return this.#frames.length; }
  get selectedFrameId() { return this.#selectedFrameId; }
  get layers() { return this.#layers.map(layer => ({ ...layer })); }
  get frames() { return this.#frames.map((f, index) => ({ id: f.id, name: f.name, index, durationMs: f.durationMs, celCount: f.cels.size })); }
  get totalDurationMs() { return this.#frames.reduce((sum, frame) => sum + frame.durationMs, 0); }

  #makeFrame({ name = 'Frame ' + (this.#frames.length + 1), durationMs = Math.round(1000 / this.#fps), copyFrom = null } = {}) {
    validateName(name, 'Frame name'); validateDuration(durationMs);
    const cels = new Map();
    for (const layer of this.#layers) {
      const source = copyFrom?.cels.get(layer.id);
      cels.set(layer.id, source ? new Uint8ClampedArray(source) : new Uint8ClampedArray(this.#width * this.#height * 4));
    }
    return { id: makeId(), name, durationMs, cels };
  }
  #frameIndex(id) {
    const index = this.#frames.findIndex(frame => frame.id === id);
    if (index < 0) throw new RangeError('Unknown animation frame ID.');
    return index;
  }
  #assertMemory(frameCount = this.#frames.length) {
    const bytes = this.#width * this.#height * 4 * this.#layers.length * frameCount;
    if (!Number.isSafeInteger(bytes) || bytes > this.#maxBytes) throw new RangeError('Animation would exceed its configured pixel-memory budget.');
  }

  getFrame(id) {
    const f = this.#frames[this.#frameIndex(id)];
    return { id: f.id, name: f.name, durationMs: f.durationMs, cels: Object.fromEntries([...f.cels].map(([key, pixels]) => [key, new Uint8ClampedArray(pixels)])) };
  }
  getCel(frameId, layerId) {
    const pixels = this.#frames[this.#frameIndex(frameId)].cels.get(layerId);
    if (!pixels) throw new RangeError('Unknown animation layer ID.');
    return new Uint8ClampedArray(pixels);
  }
  setCel(frameId, layerId, pixels) {
    const frame = this.#frames[this.#frameIndex(frameId)];
    if (!frame.cels.has(layerId)) throw new RangeError('Unknown animation layer ID.');
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== this.#width * this.#height * 4) throw new TypeError('Cel pixels must be a Uint8ClampedArray matching the animation dimensions.');
    const previous = frame.cels.get(layerId);
    for (let i = 0; i < pixels.length; i++) if (previous[i] !== pixels[i]) {
      frame.cels.set(layerId, new Uint8ClampedArray(pixels)); this.#revision++; return true;
    }
    return false;
  }
  addFrame({ afterFrameId = this.#selectedFrameId, copyFromFrameId = null, name, durationMs } = {}) {
    if (this.#frames.length >= this.#maxFrames) throw new RangeError('Animation frame limit reached.');
    this.#assertMemory(this.#frames.length + 1);
    const after = afterFrameId === null ? -1 : this.#frameIndex(afterFrameId);
    const source = copyFromFrameId === null ? null : this.#frames[this.#frameIndex(copyFromFrameId)];
    const frame = this.#makeFrame({ name: name ?? 'Frame ' + (this.#frames.length + 1), durationMs: durationMs ?? Math.round(1000 / this.#fps), copyFrom: source });
    this.#frames.splice(after + 1, 0, frame); this.#selectedFrameId = frame.id; this.#revision++;
    return { ...this.frames.find(item => item.id === frame.id) };
  }
  duplicateFrame(frameId, options = {}) {
    this.#frameIndex(frameId);
    return this.addFrame({ ...options, afterFrameId: options.afterFrameId ?? frameId, copyFromFrameId: frameId });
  }
  moveFrame(frameId, targetIndex) {
    const sourceIndex = this.#frameIndex(frameId);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.#frames.length) throw new RangeError('Target frame index is outside the timeline.');
    if (sourceIndex === targetIndex) return false;
    const reordered = [...this.#frames];
    const [frame] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, frame);
    const positions = new Map(reordered.map((item, index) => [item.id, index]));
    for (const tag of this.#tags) {
      if (positions.get(tag.startFrameId) > positions.get(tag.endFrameId)) {
        throw new RangeError('Moving this frame would invert an animation tag range.');
      }
    }
    this.#frames = reordered; this.#revision++; return true;
  }
  deleteFrame(frameId) {
    if (this.#frames.length === 1) throw new Error('An animation must retain at least one frame.');
    const index = this.#frameIndex(frameId); this.#frames.splice(index, 1);
    this.#tags = this.#tags.filter(tag => tag.startFrameId !== frameId && tag.endFrameId !== frameId);
    if (this.#selectedFrameId === frameId) this.#selectedFrameId = this.#frames[Math.min(index, this.#frames.length - 1)].id;
    this.#revision++; return true;
  }
  selectFrame(frameId) {
    this.#frameIndex(frameId);
    if (this.#selectedFrameId === frameId) return false;
    this.#selectedFrameId = frameId; return true;
  }
  setFrameDuration(frameId, durationMs) {
    validateDuration(durationMs); const frame = this.#frames[this.#frameIndex(frameId)];
    if (frame.durationMs === durationMs) return false;
    frame.durationMs = durationMs; this.#revision++; return true;
  }
  setLoop(value) {
    if (typeof value !== 'boolean') throw new TypeError('Loop must be a boolean.');
    if (this.#loop === value) return false;
    this.#loop = value; this.#revision++; return true;
  }
  setFPS(value) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_ANIMATION_FPS) throw new RangeError('FPS must be an integer from 1 to 120.');
    if (this.#fps === value) return false;
    this.#fps = value; this.#revision++; return true;
  }
  createTag(name, startFrameId, endFrameId) {
    const safeName = validateName(name, 'Animation tag name');
    const start = this.#frameIndex(startFrameId), end = this.#frameIndex(endFrameId);
    if (start > end) throw new RangeError('Animation tag start must not follow its end.');
    if (this.#tags.some(tag => tag.name.toLowerCase() === safeName.toLowerCase())) throw new Error('Animation tag names must be unique.');
    const tag = { id: makeId(), name: safeName, startFrameId, endFrameId }; this.#tags.push(tag); this.#revision++;
    return { ...tag, startIndex: start, endIndex: end };
  }
  getTags() { return this.#tags.map(tag => ({ ...tag, startIndex: this.#frameIndex(tag.startFrameId), endIndex: this.#frameIndex(tag.endFrameId) })); }
  getPlaybackFrames({ tagId = null } = {}) {
    let frames = this.#frames;
    if (tagId !== null) {
      const tag = this.#tags.find(item => item.id === tagId);
      if (!tag) throw new RangeError('Unknown animation tag ID.');
      frames = this.#frames.slice(this.#frameIndex(tag.startFrameId), this.#frameIndex(tag.endFrameId) + 1);
    }
    return frames.map((f, index) => ({ id: f.id, name: f.name, index: this.#frameIndex(f.id), durationMs: f.durationMs,
      cels: Object.fromEntries([...f.cels].map(([key, pixels]) => [key, new Uint8ClampedArray(pixels)])), playbackOrder: index }));
  }
  snapshot() {
    return { width: this.#width, height: this.#height, fps: this.#fps, loop: this.#loop, revision: this.#revision,
      selectedFrameId: this.#selectedFrameId, totalDurationMs: this.totalDurationMs, layers: this.layers,
      frames: this.#frames.map((f, index) => ({ id: f.id, name: f.name, index, durationMs: f.durationMs })), tags: this.getTags() };
  }
}
