# Spec — @esportsplus/queue code audit (2026-07-03)

All 7 actionable findings (F-001..F-007) COMPLETED 2026-07-03 on branch audit/2026-07-03.
Permanent record: storage/CHANGELOG.md + git history. This worklist is self-consumed; no open actionable items remain.

## Metadata

- Scope: src/ (constants.ts, index.ts, queue.ts, scheduler.ts, types.ts)
- Source: code-audit v12 finder + seam pass (5 lenses), Judge-consolidated
- Commit at audit: 11b9311; fixes: F-001 fix(scheduler), F-002 fix(queue), F-003 fix(index), F-004 refactor(index), F-005/006/007 test(index)
- Final gate: `pnpm exec tsc --noEmit` clean; `pnpm test` 48/48; P0/P1 fixes verified end-to-end (Node v24.15.0)

## Convergence Status

- Discovery: COMPLETE for the fixed 5-file src/ manifest (all lenses + G-6 seam).
- Open findings: P0 = 0, P1 = 0, P2 = 0 (all 7 actionable findings COMPLETED). Fix convergence reached.

## Deferred / Decision Memos (open backlog — NOT implemented this run)

For a future attended/focused pass (rationale in storage/CHANGELOG.md):

- Dead `globalThis?.` optional-chain guards (index.ts:25, 38) — P2 cosmetic, zero runtime impact.
- Public `dispose()`/teardown API for Scheduler + api.immediate — additive public API = Ask-First.
- Unbounded node-pool cap (queue.ts release) — contradicts the minimize-GC-via-unbounded-pool design; author decision.
- Queue `preallocate <= 0` boundary (reject-vs-document) — API decision for the author.
- Queue.next() stale-ref-clearing regression test — needs GC hooks / a private test seam; would be flaky.
- Research candidates RC-1 ring-buffer / RC-2 packed storage / RC-4 batched-drain / RC-5 block-size sweep — speculative redesigns needing a benchmark harness + ≥10% proof.
