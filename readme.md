# @esportsplus/queue

Zero-dependency, high-performance FIFO queue and task scheduler for JavaScript/TypeScript. Uses chunked linked-list nodes with object pooling to minimize GC pressure, and provides schedulers backed by `MessageChannel`, `queueMicrotask`, or `requestAnimationFrame`.

## Install

```bash
pnpm add @esportsplus/queue
```

## Usage

### Queue

```typescript
import queue from '@esportsplus/queue';

// Create a raw FIFO queue (default chunk size: 128)
let q = queue<string>();

q.add('a');
q.add('b');

q.next(); // 'a'
q.next(); // 'b'
q.next(); // undefined

q.length; // 0
```

Custom chunk size:

```typescript
let q = queue<number>(256);
```

### Schedulers

Schedulers wrap a queue with an automatic flush strategy. Tasks added to a scheduler are drained on the next tick of the chosen scheduling mechanism.

#### `queue.immediate()` — MessageChannel

Runs tasks in a macrotask, after the current microtask queue drains but before `setTimeout(0)`. Best for breaking up work without yielding to rendering.

```typescript
import queue from '@esportsplus/queue';

let scheduler = queue.immediate();

scheduler.add(() => console.log('runs on next macrotask'));
```

#### `queue.micro()` — queueMicrotask

Runs tasks as microtasks (same timing as `Promise.then`). Falls back to `Promise.resolve().then()` when `queueMicrotask` is unavailable.

```typescript
let scheduler = queue.micro();

scheduler.add(() => console.log('runs as microtask'));
```

#### `queue.raf()` — requestAnimationFrame

Runs tasks on the next animation frame. Falls back to `setTimeout(_, 16)` in non-browser environments.

```typescript
let scheduler = queue.raf();

scheduler.add(() => console.log('runs on next frame'));
```

### Throttling

Limit how many tasks execute per flush and enforce a minimum interval between flushes:

```typescript
let scheduler = queue.raf().throttle(5, 1000);

// At most 5 tasks per flush, with a minimum 200ms (1000/5) gap between flushes
for (let i = 0; i < 20; i++) {
    scheduler.add(() => console.log(i));
}
```

### Chaining

`add()`, `schedule()`, and `throttle()` return `this` for chaining:

```typescript
queue.immediate()
    .throttle(10, 1000)
    .add(() => doWork())
    .add(() => doMoreWork());
```

## API

### `queue<T>(preallocate?: number): Queue<T>`

Factory function. Returns a raw `Queue<T>` instance.

| Param | Type | Default | Description |
|---|---|---|---|
| `preallocate` | `number` | `128` | Chunk size — number of slots per internal linked-list node |

### `queue.immediate(): Scheduler`

Returns a `Scheduler` backed by `MessageChannel.postMessage`.

### `queue.micro(): Scheduler`

Returns a `Scheduler` backed by `queueMicrotask` (or `Promise.resolve().then` fallback).

### `queue.raf(): Scheduler`

Returns a `Scheduler` backed by `requestAnimationFrame` (or `setTimeout(_, 16)` fallback).

---

### `Queue<T>`

A chunked linked-list FIFO queue with internal node pooling.

| Member | Signature | Description |
|---|---|---|
| `length` | `get length: number` | Number of items currently in the queue |
| `add` | `(value: T) => void` | Enqueue a value |
| `clear` | `() => void` | Remove all items and return nodes to the pool |
| `next` | `() => T \| undefined` | Dequeue and return the next value, or `undefined` if empty |

**Internal design:**
- Data is stored in fixed-size array chunks (`Node<T>`) linked together
- Exhausted nodes are recycled into a pool and reused on the next allocation
- References are nulled on dequeue to avoid memory leaks

---

### `Scheduler`

Wraps a `Queue<Task>` with automatic scheduling and optional throttling.

| Member | Signature | Description |
|---|---|---|
| `length` | `get length: number` | Number of pending tasks |
| `add` | `(task: Task) => this` | Enqueue a task and trigger scheduling |
| `schedule` | `() => this` | Manually trigger a flush if tasks are pending and scheduler is idle |
| `throttle` | `(limit: number, ms: number) => this` | Limit flushes to `limit` tasks per run with a minimum `ms / limit` interval between runs |

**State machine:** `READY` → `SCHEDULED` → `RUNNING` → `READY`

- A flush is only scheduled when the state is `READY` and the queue is non-empty
- Re-entrant calls during `RUNNING` are no-ops; remaining items are re-scheduled after the current flush completes

---

### `Task`

```typescript
type Task = VoidFunction | (() => Promise<void>);
```

## License

MIT
