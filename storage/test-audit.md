# Test Audit Report: @esportsplus/queue

## Executive Summary

- **30 tests, 3 files, all passing** — solid foundation covering happy paths, boundaries, and state machines
- **Critical gap**: no error/throw tests — a throwing task permanently deadlocks the scheduler (state stuck at `RUNNING`)
- **Coverage holes** in throttle edge cases, async tasks, and `clear()` on empty queue
- **Dead dependency**: `denque` in devDependencies, never imported

## Findings

### Category 1: Critical — Scheduler Deadlock on Task Error

| File | Line | Issue | Severity |
|------|------|-------|----------|
| src/scheduler.ts | 22-51 | `run()` has no try/catch — if `task()` throws, `state` stays `RUNNING` permanently. All subsequent `add()` calls queue tasks but `schedule()` is a no-op (state !== READY). Scheduler is dead. | **critical** |
| tests/scheduler.ts | — | No test verifies behavior when a task throws | **critical** |

**Impact**: Any user-supplied task that throws kills the entire scheduler instance with no recovery path.

### Category 2: Missing Coverage — Queue

| File | Line | Issue | Severity |
|------|------|-------|----------|
| tests/queue.ts | — | `clear()` on already-empty queue not tested | low |
| tests/queue.ts | — | Multiple consecutive `clear()` calls not tested | low |
| tests/queue.ts | — | `add()` after full drain via node exhaustion (tail set to null by `next()`) — only covered indirectly by stress test | low |
| tests/queue.ts | — | Large preallocate (single node, never triggers allocation) not tested | low |

### Category 3: Missing Coverage — Scheduler

| File | Line | Issue | Severity |
|------|------|-------|----------|
| tests/scheduler.ts | — | Throttle `limit > queue.length` — the `!task` break (line 39-41) never exercised directly | med |
| tests/scheduler.ts | — | Async tasks (`() => Promise<void>`) never tested — `run()` doesn't `await`, so promises fire-and-forget. Type signature misleads. | med |
| tests/scheduler.ts | — | `throttle()` called multiple times (override behavior) not tested | low |
| tests/scheduler.ts | — | `throttle()` called after tasks already queued not tested | low |
| tests/scheduler.ts | — | `schedule()` called during RUNNING state (from external code, not re-entrancy) not tested | low |

### Category 4: Missing Coverage — Index/Integration

| File | Line | Issue | Severity |
|------|------|-------|----------|
| src/index.ts | 27-28 | `api.micro()` fallback path (Promise.resolve) when `queueMicrotask` unavailable — not tested | med |
| src/index.ts | 15 | `api.immediate()` MessageChannel `onmessage !== task` optimization — not tested | low |

### Category 5: Test Quality

| File | Line | Issue | Severity |
|------|------|-------|----------|
| tests/scheduler.ts | 159,191 | `vi.useFakeTimers()`/`vi.useRealTimers()` inline — no `afterEach` cleanup. If test fails mid-execution, fake timers leak to subsequent tests | med |
| tests/index.ts | 43,65 | Timing-based assertions (`setTimeout(resolve, 10)`, `setTimeout(resolve, 50)`) — fragile under load | low |
| vitest.config.ts | 19 | `passWithNoTests: true` masks missing test files | low |

### Category 6: Dead Dependency

| File | Line | Issue | Severity |
|------|------|-------|----------|
| package.json | — | `denque` v2.1.0 in devDependencies — never imported anywhere | low |

## Metrics

- Test files: 3
- Tests: 30 (all passing)
- Source files: 5 (constants, index, queue, scheduler, types)
- Issues found: 15
- Critical: 1 (scheduler deadlock on throw)
- Medium: 4
- Low: 10

## Recommended Actions

### Priority 1 — Fix scheduler deadlock + add test

Wrap `run()` task execution in try/finally to ensure `state` resets to `READY`:

```
// In run(), wrap the task loop:
try { task(); } catch (e) { /* optionally: remove failed task */ } finally { }
// Or wrap the entire body after RUNNING guard in try/finally
```

Add tests:
- Task that throws → scheduler recovers, remaining tasks still execute on next flush
- Task that throws → subsequent `add()` still works

### Priority 2 — Add missing scheduler tests

- Throttle with `limit > queue size` (verify `!task` break path)
- Async task behavior (document fire-and-forget semantics or add `await`)
- Fake timer cleanup via `afterEach`

### Priority 3 — Add queue edge case tests

- `clear()` on empty queue
- Multiple consecutive `clear()` calls
- Single-node queue (large preallocate, no node transitions)

### Priority 4 — Cleanup

- Remove `denque` from devDependencies
- Consider removing `passWithNoTests: true`

## Next Steps

To implement, ask:
- "Fix the scheduler deadlock bug"
- "Add the missing tests"
- "Implement all findings"
