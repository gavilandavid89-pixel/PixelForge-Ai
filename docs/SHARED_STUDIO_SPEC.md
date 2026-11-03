# Shared PixelForge Studio — collaboration and AI agent specification

## Goal

A person can ask the PixelForge AI agent to create or edit an asset, watch the work appear in the same project workspace, inspect the proposal, and accept or reject it. The agent must work through the same editor engine and project model as the visual editor.

## Identity model

Do not make the human and the agent share a password or browser session. Use one shared studio/workspace with separate identities:
- **Owner account:** creates the studio, controls membership, billing and recovery.
- **Member account:** the human's normal sign-in, with project permissions granted by the owner.
- **AI agent identity:** a non-human service identity with narrowly scoped, revocable permissions. It is not a personal login and has no password that a person shares.

This gives the user and agent a common project without exposing account credentials. If the product later supports multiple humans, the same model extends to additional members.

## Shared project model

- A studio contains projects; each project has a stable ID, owner, revision and membership ACL.
- The editor and agent load the same canonical project revision.
- The agent receives a read snapshot (visual captures plus structured metadata), then edits a private proposal branch/sandbox.
- The proposal stores its base revision, changed layers/frames, preview images, operation log and validation report.
- Accept applies the proposal as one undoable transaction only if the base revision is still current; otherwise the user must review/rebase.
- Reject discards the proposal without changing the canonical project.
- Presence/activity shows whether the user or agent is currently viewing/editing, and records who created each proposal and who accepted it.

## Agent permissions

Allowed by default: read project metadata and visual content, inspect layers and animation frames, create/modify sandbox layers and frames, render previews, and submit proposals.

Not allowed by default: delete projects, change account settings or membership, publish, export/download project content, access unrelated projects, read billing details, or change credentials. Export remains a user-controlled operation.

## Live visibility

- The user can watch the agent's current task, selected project, active frame, operation progress and preview.
- The agent sees either the clean artwork, the editor interface, or both, with an explicit mode indicator.
- For animation, every frame has stable identity, order, duration and image data. The agent can inspect one frame, compare adjacent frames, and inspect a contact sheet plus a playback render.
- Intermediate work is visible only in the proposal workspace; the canonical project remains unchanged until acceptance.

## Backend and security requirements

- Use a real authentication provider; never store raw passwords.
- Store provider/API credentials server-side, encrypted and never in project JSON or browser local storage.
- Use short-lived scoped agent tokens, project-level ACL checks on every request, rate limits, audit events and revocation.
- Use optimistic concurrency on project revisions and atomic proposal acceptance.
- Keep local-first editing usable if sign-in or the remote service is unavailable.
- Obtain explicit consent before sending screenshots, frames or project pixels to a remote model. Show exactly what is being shared.

## Current implementation boundary

Implemented today: DOM-free raster runtime, isolated sandbox/proposals, validated visual observation packets for interface/artwork/combined views, and multimodal provider input for separately labeled frame images.

Not implemented yet: account sign-in, shared cloud studio, live synchronization/presence, browser screenshot capture adapter, animation timeline/cel engine, frame editing commands, playback renderer, and video encoder. This document is a target contract, not a claim that those services already exist.
