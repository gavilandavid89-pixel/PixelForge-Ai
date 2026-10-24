import { RasterDocument } from './core.js';

/**
 * Creates an independent raster snapshot. Pixel buffers, layer objects and
 * history arrays are never shared with the source document.
 */
export function cloneRasterDocument(source, { name = source.name } = {}) {
  if (!(source instanceof RasterDocument)) throw new TypeError('Expected a RasterDocument source.');
  const copy = new RasterDocument(source.width, source.height, name);
  copy.id = crypto.randomUUID();
  copy.layers = source.layers.map(layer => ({
    ...layer,
    id: crypto.randomUUID(),
    pixels: new Uint8ClampedArray(layer.pixels),
  }));
  const layerMap = new Map(source.layers.map((layer, i) => [layer.id, copy.layers[i].id]));
  copy.activeLayerId = layerMap.get(source.activeLayerId) ?? copy.layers[0].id;
  copy.compositeCache = new Uint8ClampedArray(source.width * source.height * 4);
  copy.revision = source.revision;
  copy.saveVersion = source.saveVersion;
  copy.history = [];
  copy.future = [];
  copy.historyBytes = 0;
  copy.dirty = false;
  return copy;
}

/**
 * Isolated AI workspace. Proposal acceptance is optimistic-concurrency guarded
 * and commits pixel changes to the source as one undoable batch. Structural
 * layer edits are rejected until a structural merge implementation exists.
 */
export class AIWorkspace {
  #source;
  #sandbox;
  #baseRevision;
  #layerBindings = [];
  #baseLayerState = [];
  #proposal = null;

  constructor(sourceDocument) {
    if (!(sourceDocument instanceof RasterDocument)) throw new TypeError('Expected a RasterDocument.');
    this.#source = sourceDocument;
    this.#refreshSandbox();
  }

  get sandbox() { return this.#sandbox; }
  get baseRevision() { return this.#baseRevision; }
  get hasProposal() { return this.#proposal !== null; }
  get proposalSummary() {
    if (!this.#proposal) return null;
    return Object.freeze({
      id: this.#proposal.id,
      baseRevision: this.#proposal.baseRevision,
      sandboxRevision: this.#proposal.sandboxRevision,
      sandboxStale: this.#sandbox.revision !== this.#proposal.sandboxRevision,
      stale: this.#source.revision !== this.#proposal.baseRevision,
      createdAt: this.#proposal.createdAt,
      summary: this.#proposal.summary,
    });
  }

  syncFromUser({ discardProposal = false } = {}) {
    if (this.#proposal && !discardProposal) {
      return { status: 'proposal-pending', stale: this.#source.revision !== this.#proposal.baseRevision };
    }
    this.#proposal = null;
    this.#refreshSandbox();
    return { status: 'synced', baseRevision: this.#baseRevision };
  }

  createProposal(summary = 'AI editing proposal') {
    if (this.#proposal) throw new Error('A proposal is already pending; accept or discard it first.');
    if (typeof summary !== 'string' || !summary.trim()) throw new TypeError('Proposal summary must be non-empty text.');
    this.#proposal = {
      id: crypto.randomUUID(),
      baseRevision: this.#baseRevision,
      sandboxRevision: this.#sandbox.revision,
      createdAt: new Date().toISOString(),
      summary: summary.trim().slice(0, 500),
    };
    return this.proposalSummary;
  }

  discardProposal() {
    if (!this.#proposal) return false;
    this.#proposal = null;
    this.#refreshSandbox();
    return true;
  }

  validateProposalBase() {
    if (!this.#proposal) return { valid: false, reason: 'no-proposal' };
    if (this.#source.revision !== this.#proposal.baseRevision) {
      return { valid: false, reason: 'stale-base', expectedRevision: this.#proposal.baseRevision, actualRevision: this.#source.revision };
    }
    if (this.#sandbox.revision !== this.#proposal.sandboxRevision) {
      return { valid: false, reason: 'proposal-changed', expectedSandboxRevision: this.#proposal.sandboxRevision, actualSandboxRevision: this.#sandbox.revision };
    }
    return { valid: true, baseRevision: this.#baseRevision, sandboxRevision: this.#proposal.sandboxRevision };
  }

  getVisualDiff() {
    const sourcePixels = this.#source.composite();
    const sandboxPixels = this.#sandbox.composite();
    const pixels = new Uint8ClampedArray(this.#source.width * this.#source.height * 4);
    let changedPixels = 0, minX = this.#source.width, minY = this.#source.height, maxX = -1, maxY = -1;
    for (let y = 0; y < this.#source.height; y++) for (let x = 0; x < this.#source.width; x++) {
      const offset = (y * this.#source.width + x) * 4;
      if (sourcePixels[offset] === sandboxPixels[offset] && sourcePixels[offset + 1] === sandboxPixels[offset + 1] &&
          sourcePixels[offset + 2] === sandboxPixels[offset + 2] && sourcePixels[offset + 3] === sandboxPixels[offset + 3]) continue;
      pixels[offset] = 255; pixels[offset + 1] = 72; pixels[offset + 2] = 186; pixels[offset + 3] = 230;
      changedPixels++;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return {
      width: this.#source.width,
      height: this.#source.height,
      pixels,
      changedPixels,
      bounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    };
  }

  acceptProposal() {
    const validation = this.validateProposalBase();
    if (!validation.valid) return { status: 'rejected', ...validation };
    if (this.#source.width !== this.#sandbox.width || this.#source.height !== this.#sandbox.height) {
      return { status: 'rejected', reason: 'dimension-mismatch' };
    }
    if (this.#sandbox.layers.length !== this.#layerBindings.length || this.#source.layers.length !== this.#layerBindings.length) {
      return { status: 'rejected', reason: 'unsupported-layer-structure' };
    }
    for (let index = 0; index < this.#layerBindings.length; index++) {
      const binding = this.#layerBindings[index];
      const sourceLayer = this.#source.layers[index];
      const sandboxLayer = this.#sandbox.layers[index];
      const base = this.#baseLayerState[index];
      if (!sourceLayer || sourceLayer.id !== binding.sourceId || sandboxLayer?.id !== binding.sandboxId ||
          sourceLayer.name !== base.name || sourceLayer.visible !== base.visible ||
          sourceLayer.opacity !== base.opacity || sourceLayer.locked !== base.locked ||
          sandboxLayer.name !== base.name || sandboxLayer.visible !== base.visible ||
          sandboxLayer.opacity !== base.opacity || sandboxLayer.locked !== base.locked) {
        return { status: 'rejected', reason: 'unsupported-layer-structure' };
      }
    }
    try {
      const replacements = this.#layerBindings.flatMap(binding => {
        const sourceLayer = this.#source.layers.find(item => item.id === binding.sourceId);
        const sandboxLayer = this.#sandbox.layers.find(item => item.id === binding.sandboxId);
        if (sourceLayer.pixels.every((value, index) => value === sandboxLayer.pixels[index])) return [];
        return [{ layerId: binding.sourceId, pixels: sandboxLayer.pixels }];
      });
      const result = replacements.length
        ? this.#source.replaceLayerPixelsBatch(replacements)
        : { changedPixels: 0, changedLayers: 0 };
      this.#proposal = null;
      this.#refreshSandbox();
      return { status: 'applied', changedPixels: result.changedPixels, changedLayers: result.changedLayers };
    } catch (error) {
      return { status: 'rejected', reason: 'apply-failed', message: error instanceof Error ? error.message : 'Could not apply proposal.' };
    }
  }

  #refreshSandbox() {
    this.#sandbox = cloneRasterDocument(this.#source, { name: this.#source.name });
    this.#baseRevision = this.#source.revision;
    this.#layerBindings = this.#source.layers.map((layer, index) => ({
      sourceId: layer.id,
      sandboxId: this.#sandbox.layers[index].id,
    }));
    this.#baseLayerState = this.#source.layers.map(layer => ({
      name: layer.name, visible: layer.visible, opacity: layer.opacity, locked: layer.locked,
    }));
  }
}
