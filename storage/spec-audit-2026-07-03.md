# Spec — @esportsplus/queue code audit (2026-07-03)

## Clarifying Questions

Open — Blocking: none.
Open — Optional: none (unattended run; all questionable calls resolved by rubric — see Deferred / Decision Memos).
Answered: n/a.

## Metadata

- Scope: src/ (constants.ts, index.ts, queue.ts, scheduler.ts, types.ts)
- Source: code-audit v12 finder + seam pass (5 lenses), consolidated by Judge (resumed run)
- Commit at audit: 11b9311ee3d28595f8d1bec371a56cbac9896caa
- Baseline: `pnpm exec tsc --noEmit` clean; `pnpm test` 45/45 passing (vitest, node env, Node v24.15.0)
- Tools ran: all analyzers absent (semgrep/eslint/knip/madge/slither/aderyn/gitleaks/osv-scanner/cargo-audit); npm-audit skipped (pnpm repo, 2 devDeps). Finders ran discovery-only.
- Lifecycle: ephemeral/self-consuming — spec-implementation deletes each item on COMPLETED; changelog is the permanent record.

## Findings

### src/index.ts

#### F-003: api.immediate() pins the Node.js event loop forever — MessageChannel ports never released
- File: src/index.ts:9-22
- Symbol: api.immediate
- Category: correctness
- Priority: P1
- Found-by: correctness (F-003), performance (finding 3), seam (finding 2) — MERGED
- Evidence: `api.immediate()` creates a `MessageChannel`; first `schedule()` sets `port1.onmessage = task`. In Node (a supported target — index.ts feature-detects `queueMicrotask`/`requestAnimationFrame` with non-browser fallbacks) attaching a message handler implicitly `ref()`s the port, so after first use the event loop is held open forever: a Node script/CLI that uses `api.immediate()` once never exits. Empirically confirmed on Node v24.15.0: a MessageChannel with `onmessage` set + a posted message delivers the message but the process does NOT exit on its own. `Scheduler` exposes no teardown and both ports are captured in the closure, so a consumer cannot reach them.
- Recommendation: Manage the port ref-count internally (no public API change). Keep the port ref'd only while a message is in flight and release it when consumed: attach the handler once, `ref()` before each `postMessage`, `unref()` at the start of the handler (before invoking the task). Empirically verified on Node v24.15.0 to deliver every message (drain-to-empty AND backlog-re-post cases) AND let the process exit when idle. Concrete verified form:
    ```typescript
    api.immediate = () => {
        let handler: (() => void) | null = null,
            { port1, port2 } = new MessageChannel();

        return new Scheduler(
            api(),
            (task) => {
                if (handler === null) {
                    handler = () => {
                        port1.unref?.();
                        task();
                    };
                    port1.onmessage = handler;
                }

                port1.ref?.();
                port2.postMessage(null);
            }
        );
    };
    ```
  `ref`/`unref` are optional-chained (Node `MessagePort` has them; browser `MessagePort` does not — no-op there, browser behavior unchanged). Fully internal to the closure; public API unchanged. Do NOT add a public `dispose()`/teardown method — that is additive public API (Ask-First), deliberately out of scope for this unattended run; the internal ref/unref lifecycle removes the Node process-hang without it.
- Risk: index.ts is the package entry — every Node consumer of `queue.immediate()` currently gets a process that hangs on exit. Fix must keep task delivery intact (verified). Re-run the existing `api.immediate()` test + the new F-007 double-flush test to confirm delivery.
- Confidence: HIGH
- LOC delta: +7 / -2
- Recommended-model: opus
- API-impact: none

#### F-004: Stale, misleading "Fallback: bind then()..." comment in api.micro
- File: src/index.ts:31
- Symbol: api.micro
- Category: slop
- Priority: P2
- Found-by: architecture
- Evidence: Line 31 `// Fallback: bind then() to resolved promise to preserve context` is (a) factually wrong — there is no `.bind()` anywhere in this branch — and (b) a restatement of the adjacent `resolved.then(task)` code. Violates coding-standards.md comment rules (no restating code, no stale narration).
- Recommendation: Delete the comment line (and collapse any resulting double blank line). The `if (queueMicrotask) { … }` / fallthrough structure already makes the fallback self-evident. Do not replace with another comment.
- Risk: none — comment-only, zero runtime/consumer impact.
- Confidence: HIGH
- LOC delta: -1
- Recommended-model: sonnet
- API-impact: none

### src/queue.ts

#### F-002: Queue.clear() pools nodes without clearing data slots — retains user references for the queue's lifetime
- File: src/queue.ts:76-92
- Symbol: Queue.clear
- Category: correctness
- Priority: P1
- Found-by: correctness (F-002), performance (finding 2) — MERGED
- Evidence: `next()` deliberately nulls each consumed slot (`head.data[headIndex] = undefined`, queue.ts:106) and README:135 promises "References are nulled on dequeue to avoid memory leaks". `clear()` (queue.ts:76-92) releases every node into the pool via `release()` with `data` untouched, so all unconsumed slot references stay strongly reachable from the pool until (if ever) those exact slots are overwritten by future `add()`. Pool is unbounded and never shrinks, so a large cleared backlog (closures, captured scopes, large payloads) is pinned for the queue's lifetime. Not corruption (`size` bounds all reads), but silent heap retention. `api()` returns a raw `Queue`, so `clear()` is primary public surface.
- Recommendation: In `clear()`, wipe each node's data before releasing it. `clear()` is a cold path, so the simplest correct form is `head.data.fill(undefined)` per node while traversing head→tail (before `this.release(head)`). Restores the GC invariant `next()` already maintains.
- Risk: none for consumers; `clear()` gains O(nodes × preallocate) cost on a cold path. Existing pooling tests (tests/queue.ts) assert node reuse + values, not slot internals, so `fill(undefined)` before release is compatible — re-run them.
- Confidence: HIGH
- LOC delta: +2 / -0
- Recommended-model: sonnet
- API-impact: none

### src/scheduler.ts

#### F-001: Throttled scheduler busy-spins the event loop for the whole interval; permanent freeze with micro/immediate backends
- File: src/scheduler.ts:22-54 (gate scheduler.ts:33, reschedule scheduler.ts:50-53, lastRunAt scheduler.ts:47)
- Symbol: Scheduler.run
- Category: correctness
- Priority: P0
- Found-by: correctness (F-001 + F-005), performance (finding 1), seam (finding 1), research-synthesizer (candidate 3) — MERGED
- Evidence: When `throttled` is set and the gate `throttle.interval <= now - this.lastRunAt` (scheduler.ts:33) FAILS, `run()` drains nothing but the `finally` (scheduler.ts:50-53) still sets `state = READY` and calls `schedule()`, which re-invokes the backend whenever the queue is non-empty. With `api.micro()` the re-post is a microtask queued from a microtask → the event loop is synchronously blocked at 100% CPU until wall-clock crosses the interval; with `api.immediate()` a CPU-saturating MessageChannel macrotask loop. Reachable from documented usage (README "Chaining": `queue.immediate().throttle(10, 1000)`). Degenerate `throttle(0, ms)` yields `interval = Infinity` (blessed by tests/scheduler.ts:293 as "prevents execution") → gate never passes → with micro/immediate the spin never terminates (permanent freeze). SECONDARY defect (same symbol, MERGED from correctness F-005): `this.lastRunAt = now` is set only AFTER the drain loop, so if a task throws mid-batch the timestamp is not updated and the next flush passes the gate immediately — throttle rate silently exceeded (up to 2×) around a throw.
- Recommendation: Restructure `run()` so a throttled-early tick arms ONE delayed wake instead of re-spinning, and set `lastRunAt` at flush start. Verified against all 8 throttle tests in tests/scheduler.ts (including the `throttle(0)` Infinity-interval "prevents execution" case, which must NOT throw). Concrete verified form:
    ```typescript
    private run() {
        if (this.state === RUNNING) {
            return;
        }

        this.state = RUNNING;

        let now = Date.now(),
            throttle = this.throttled;

        if (throttle && throttle.interval > now - this.lastRunAt) {
            let remaining = this.lastRunAt + throttle.interval - now;

            if (Number.isFinite(remaining)) {
                this.state = SCHEDULED;
                setTimeout(this.task, remaining);
            }
            else {
                this.state = READY;
            }

            return;
        }

        this.lastRunAt = now;

        try {
            let q = this.queue,
                n = throttle?.limit ?? q.length;

            for (let i = 0; i < n; i++) {
                let task = q.next();

                if (!task) {
                    break;
                }

                task();
            }
        }
        finally {
            this.state = READY;
            this.schedule();
        }
    }
    ```
  The finite-remaining branch keeps `state = SCHEDULED` so concurrent `add()` calls no-op (single pending timer). The Infinity branch (only reachable via `throttle(0, ·)`) returns to READY without arming a timer or re-posting — "prevents execution" with zero ongoing cost, no spin, preserving tests/scheduler.ts:293. Do NOT add a throwing `limit <= 0` guard — it breaks tests/scheduler.ts:293. `setTimeout`/`Number.isFinite` need no imports.
- Risk: scheduler.ts is consumed by the package entry; all three factory schedulers exhibit the spin whenever `throttle()` is used. Wake timing shifts from host-tick to `setTimeout(remaining)` — strictly closer to the documented throttle contract; the current busy-wait is not a behavior any consumer can depend on. Non-throttled paths untouched (early branch guarded by `throttle && …`). Re-run the full tests/scheduler.ts throttle + error-handling suites.
- Confidence: HIGH
- LOC delta: +12 / -6
- Recommended-model: opus
- API-impact: none

### tests/index.ts

#### F-005: api.micro() queueMicrotask-undefined fallback branch has zero test coverage
- File: src/index.ts:31-34 (fix in tests/index.ts)
- Symbol: api.micro
- Category: test-quality
- Priority: P2
- Found-by: testing
- Evidence: `globalThis.queueMicrotask` is defined natively in the vitest node environment, so the `if (queueMicrotask)` branch always wins; the `resolved.then(task)` fallback (index.ts:31-34) has 0 executions across the suite. A regression in the fallback (wrong `.then` binding, task never invoked) would ship silently to any environment lacking native `queueMicrotask`.
- Recommendation: Add a test in tests/index.ts that stubs `queueMicrotask` undefined for the duration — `vi.stubGlobal('queueMicrotask', undefined)` before `api.micro()`, `vi.unstubAllGlobals()` after (import `vi` from vitest) — then add a task and assert it still executes (await a couple of microticks), exercising the `resolved.then(task)` fallback.
- Risk: none — additive test only.
- Confidence: HIGH
- LOC delta: +12 / -0
- Recommended-model: sonnet
- API-impact: none

#### F-006: api.raf() requestAnimationFrame primary branch has zero test coverage
- File: src/index.ts:40-42 (fix in tests/index.ts)
- Symbol: api.raf
- Category: test-quality
- Priority: P2
- Found-by: testing
- Evidence: `globalThis.requestAnimationFrame` is undefined in the vitest node environment, so the only api.raf() test exercises only the `setTimeout(task, 16)` fallback (index.ts:44). The primary `requestAnimationFrame(task)` branch (index.ts:40-42) has 0 executions. A regression there (wrong callback signature) ships undetected to every browser consumer.
- Recommendation: Add a test in tests/index.ts that stubs `requestAnimationFrame` — `vi.stubGlobal('requestAnimationFrame', (cb) => cb(0))` before `api.raf()`, unstub after — then add a task and assert it executes via the rAF branch (distinct from the setTimeout fallback already covered).
- Risk: none — additive test only.
- Confidence: HIGH
- LOC delta: +10 / -0
- Recommended-model: sonnet
- API-impact: none

#### F-007: api.immediate() onmessage-reuse (second-flush) branch has zero test coverage
- File: src/index.ts:15 (fix in tests/index.ts)
- Symbol: api.immediate
- Category: test-quality
- Priority: P2
- Found-by: testing
- Evidence: The handler-set-once guard in api.immediate is only exercised on the first `schedule()`; the skip-reassignment path on subsequent flushes has 0 executions — the only immediate test does a single add+flush. A latent bug in the reuse path (stale closure, dropped post) would only surface on a second flush.
- Recommendation: Add a test in tests/index.ts that adds + awaits a flush twice on the SAME `api.immediate()` instance and asserts the task executes both times, exercising the reuse branch. Implementation-agnostic (assert both executions), so it holds under the F-003 handler restructure.
- Risk: none — additive test only. Coordinate with F-003 (both touch api.immediate) — assert executions, not internals.
- Confidence: HIGH
- LOC delta: +12 / -0
- Recommended-model: sonnet
- API-impact: none

## Convergence Status

- Discovery: COMPLETE for the fixed 5-file src/ manifest (all applicable lenses evaluated per detail coverage tables; G-6 seam pass over 5 edges complete).
- Open findings after Judge: P0 = 1, P1 = 2, P2 = 4 (7 total actionable).
- Note: registry `record` (Phase 4) never ran before the prior run died, so registry.json shows run_counter 0 / 0% — an un-run recorder, not un-covered files.

## Deferred / Decision Memos (NOT for implementation — unattended rubric calls)

These are real backlog items intentionally excluded from this unattended auto-fix run; record for a future attended/focused pass. Do NOT implement.

- Dead `globalThis?.` optional-chain guards (index.ts:25, 38) — P2 cosmetic, zero runtime impact; Judge dropped as noise (detail's own hedge).
- Public `dispose()`/teardown API for Scheduler + api.immediate — additive PUBLIC API = Ask-First; cannot add unattended. F-003's internal ref/unref lifecycle removes the Node process-hang without it.
- Unbounded node-pool cap (queue.ts release) — capping contradicts the library's stated "minimize GC pressure via unbounded pool" design; author policy decision.
- Queue `preallocate <= 0` boundary (reject-vs-document) — degenerate but FIFO-correct today; changing it is an API decision for the author.
- Queue.next() stale-ref-clearing regression test — requires GC hooks (`--expose-gc`/FinalizationRegistry) or a private test seam; would be flaky/non-deterministic.
- Research candidates RC-1 ring-buffer redesign / RC-2 packed-element storage / RC-4 batched-drain API / RC-5 block-size sweep — speculative redesigns needing a benchmark harness that does not exist + ≥10% proof; several change API/behavior. Not for unattended auto-fix.
