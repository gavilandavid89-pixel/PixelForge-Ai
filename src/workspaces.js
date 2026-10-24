import { RasterDocument } from './core.js';

/**
 * Creates a fully independent raster-document snapshot. Pixel buffers, layer
 * objects and history arrays are never shared with the source document.
 * Viewport/UI state is intentionally not copied.
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
  // Keep the constructor's all-dirty marker so the first composite is rebuilt.
  copy.revision = source.revision;
  copy.saveVersion = source.saveVersion;
  copy.history = [];
  copy.future = [];
  copy.historyBytes = 0;
  copy.dirty = false;
  return copy;
}

/**
 * Minimal lifecycle controller for the isolated AI workspace.
 * This deliberately exposes no canonical-document mutation, project deletion,
 * or export method. The host UI must invoke human approval separately.
 */
export class AIWorkspace {
  #source;
  #sandbox;
  #baseRevision;
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
      sandboxRevision: this.#sandbox.revision,
      stale: this.#source.revision !== this.#proposal.baseRevision,
      createdAt: this.#proposal.createdAt,
      summary: this.#proposal.summary,
    });
  }

  /** User edits flow to AI only when no proposal would be silently discarded. */
  syncFromUser({ discardProposal = false } = {}) {
    if (this.#proposal && !discardProposal) {
      return { status: 'proposal-pending', stale: this.#source.revision !== this.#proposal.baseRevision };
    }
    this.#proposal = null;
    this.#refreshSandbox();
    return { status: 'synced', baseRevision: this.#baseRevision };
  }

  createProposal(summary = 'AI editing proposal') {
    if (typeof summary !== 'string' || !summary.trim()) throw new TypeError('Proposal summary must be non-empty text.');
    this.#proposal = {
      id: crypto.randomUUID(),
      baseRevision: this.#baseRevision,
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

  /** Returns a read-only conflict report; never applies anything to the source. */
  validateProposalBase() {
    if (!this.#proposal) return { valid: false, reason: 'no-proposal' };
    if (this.#source.revision !== this.#proposal.baseRevision) {
      return { valid: false, reason: 'stale-base', expectedRevision: this.#proposal.baseRevision, actualRevision: this.#source.revision };
    }
    return { valid: true, baseRevision: this.#proposal.baseRevision };
  }

  #refreshSandbox() {
    this.#sandbox = cloneRasterDocument(this.#source, { name: this.#source.name });
    this.#baseRevision = this.#source.revision;
  }
}
