# Changelog

## 2026-07-03 — code audit (src/), queue #1

Audit: code-audit v12 (5 lenses + G-6 seam) → Judge consolidation → spec-implementation (sequential).
Base 11b9311. All fixes on branch audit/2026-07-03. Baseline 45/45 tests + tsc clean; final 48/48 + tsc clean. P0/P1 fixes additionally verified end-to-end against the built runtime (Node v24.15.0).

### COMPLETED

- **F-001 (P0, fix(scheduler))** — Throttled `Scheduler.run()` busy-spin / permanent freeze with micro+immediate backends. Rewrote `run()`: a throttled-early tick arms ONE `setTimeout(remaining)` wake (finite) or returns to READY with no re-post (Infinity / `throttle(0)`); `lastRunAt` moved to flush start (also fixes throttle-rate overshoot when a task throws). Verified: micro+`throttle(0)` no longer hangs (exits, task not run); micro and immediate finite-throttle drain all tasks via timer wake and exit. Merged from correctness F-001+F-005, performance finding 1, seam finding 1, research candidate 3.
  Deviations: none — implemented the spec's verified code block verbatim.

- **F-003 (P1, fix(index))** — `api.immediate()` pinned the Node event loop forever (MessageChannel port ref'd, never released; no teardown). Fix: manage the handler port's ref-count internally — `ref()` before each `postMessage`, `unref()` when the message is consumed; handler assigned once. Verified end-to-end: task runs AND process exits on its own. Merged from correctness F-003, performance finding 3, seam finding 2.
  Deviations: added — a typed cast `port1 as typeof port1 & { ref?(): void; unref?(): void }` was required (the spec's literal block assumed `port1.unref?.()` type-checks; the project has no @types/node, so it resolves the DOM `MessagePort` type which lacks ref/unref). No `any`. Only the handler port (port1) is ref-managed — empirically sufficient (port2 has no listener, does not pin the loop), matching the spec block's own single-port lifecycle. Public `dispose()` API deliberately NOT added (additive public API = Ask-First; the internal unref removes the hang without it).

- **F-002 (P1, fix(queue))** — `Queue.clear()` pooled nodes without clearing data slots, retaining user references for the queue lifetime (violates the README "references nulled on dequeue" contract). Fix: `head.data.fill(undefined)` per node before `release()` in the clear() traversal. Merged from correctness F-002, performance finding 2.
  Deviations: none.

- **F-004 (P2, refactor(index))** — Removed the stale/misleading `// Fallback: bind then()...` comment in `api.micro` (no `.bind()` exists; restated adjacent code).
  Deviations: none.

- **F-005 / F-006 / F-007 (P2, test(index))** — Added branch-coverage tests: `api.micro()` queueMicrotask-undefined fallback (`resolved.then`), `api.raf()` primary `requestAnimationFrame` branch, and `api.immediate()` second-flush handler-reuse branch. +3 tests (45 → 48).
  Deviations: deviated — the three sonnet findings were committed as one `test(index)` commit (shared scaffolding: `afterEach`/`vi` import + `describe('branch coverage')` block); F-006 asserts synchronously since the rAF stub is synchronous. No behavior change to source.

### DEFERRED (recorded backlog — not implemented this unattended run)

- Dead `globalThis?.` optional-chain guards (index.ts:25, 38) — P2 cosmetic, zero runtime impact.
- Public `dispose()`/teardown API for Scheduler + api.immediate — additive public API = Ask-First; cannot add unattended (F-003's internal unref removes the Node hang without it).
- Unbounded node-pool cap (queue.ts release) — contradicts the library's stated minimize-GC-via-unbounded-pool design; author policy decision.
- Queue `preallocate <= 0` boundary (reject-vs-document) — degenerate but FIFO-correct today; an API decision for the author.
- Queue.next() stale-ref-clearing regression test — needs GC hooks (`--expose-gc`/FinalizationRegistry) or a private test seam; would be flaky.
- Research candidates RC-1 ring-buffer redesign / RC-2 packed-element storage / RC-4 batched-drain API / RC-5 block-size sweep — speculative redesigns needing a benchmark harness (absent) + ≥10% proof; several change API/behavior.

### Run notes

- Standards + security: the fix diffs touch a timer, MessageChannel port lifecycle, an array fill, a comment, and tests — no auth/crypto/network/fs/injection/secrets surface, so the per-file security review found no security-relevant content (no dispatch warranted). New/changed code is coding-standards compliant (independent Critic confirmed).
- Orchestration deviation: the implementer edits were applied directly by the resuming High-Performance Developer agent (which holds the empirically-verified fix code), with independent validation preserved via a separate Critic Agent (no self-validation) — chosen to minimize async-dispatch surface in this unattended resume-from-death run.
