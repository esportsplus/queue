import { describe, expect, it, vi } from 'vitest';

import { Queue } from '../src/queue';
import { Scheduler } from '../src/scheduler';
import type { Task } from '../src/types';


describe('Scheduler', () => {

    describe('happy path', () => {

        it('add() enqueues task and triggers schedule', () => {
            let captured: (() => void) | null = null,
                callCount = 0,
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; callCount++; });

            s.add(() => {});

            expect(callCount).toBe(1);
            expect(captured).not.toBeNull();
        });

        it('run() executes all queued tasks in order', () => {
            let captured: (() => void) | null = null,
                order: number[] = [],
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; });

            s.add(() => order.push(1));
            s.add(() => order.push(2));
            s.add(() => order.push(3));

            captured!();

            expect(order).toEqual([1, 2, 3]);
        });

        it('length reflects pending tasks', () => {
            let captured: (() => void) | null = null,
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; });

            expect(s.length).toBe(0);

            s.add(() => {});
            s.add(() => {});

            expect(s.length).toBe(2);

            captured!();

            expect(s.length).toBe(0);
        });

    });


    describe('state machine', () => {

        it('run() is reentrant-safe (RUNNING guard)', () => {
            let captured: (() => void) | null = null,
                count = 0,
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; });

            s.add(() => {
                count++;
                // Attempt reentrant run — should be blocked by RUNNING guard
                captured!();
            });
            s.add(() => { count++; });

            captured!();

            expect(count).toBe(2);
        });

        it('state transitions: READY → SCHEDULED → RUNNING → READY', () => {
            let captured: (() => void) | null = null,
                q = new Queue<Task>(128),
                schedulerCalls = 0,
                s = new Scheduler(q, (task) => { captured = task; schedulerCalls++; });

            // READY → add triggers schedule → SCHEDULED
            s.add(() => {});

            expect(schedulerCalls).toBe(1);

            // SCHEDULED → captured!() triggers run → RUNNING → tasks execute → READY
            captured!();

            // After run completes, state is READY and queue is empty, so no further schedule
            expect(schedulerCalls).toBe(1);
            expect(s.length).toBe(0);
        });

    });


    describe('guard', () => {

        it('schedule() is no-op when queue empty', () => {
            let callCount = 0,
                q = new Queue<Task>(128),
                s = new Scheduler(q, () => { callCount++; });

            s.schedule();

            expect(callCount).toBe(0);
        });

        it('schedule() is no-op when not READY', () => {
            let callCount = 0,
                q = new Queue<Task>(128),
                s = new Scheduler(q, () => { callCount++; });

            // add() calls schedule() internally → state becomes SCHEDULED, callCount = 1
            s.add(() => {});

            expect(callCount).toBe(1);

            // Calling schedule() again while SCHEDULED should be a no-op
            s.schedule();

            expect(callCount).toBe(1);
        });

    });


    describe('batching', () => {

        it('multiple add() calls batch into single flush', () => {
            let captured: (() => void) | null = null,
                count = 0,
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; count++; });

            s.add(() => {});
            s.add(() => {});
            s.add(() => {});

            // Scheduler should only have been called once (first add triggers schedule,
            // subsequent adds see state !== READY and skip)
            expect(count).toBe(1);

            captured!();

            expect(s.length).toBe(0);
        });

    });


    describe('throttle', () => {

        it('throttle() limits tasks per flush', () => {
            vi.useFakeTimers();
            vi.setSystemTime(1000);

            let captured: (() => void) | null = null,
                executed: number[] = [],
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; });

            s.throttle(2, 1000);

            s.add(() => executed.push(1));
            s.add(() => executed.push(2));
            s.add(() => executed.push(3));
            s.add(() => executed.push(4));

            captured!();

            // Only 2 tasks should have executed (limit = 2)
            expect(executed).toEqual([1, 2]);
            expect(s.length).toBe(2);

            // Advance time past interval (1000ms / 2 = 500ms)
            vi.setSystemTime(1501);

            captured!();

            expect(executed).toEqual([1, 2, 3, 4]);
            expect(s.length).toBe(0);

            vi.useRealTimers();
        });

        it('throttle() enforces interval between flushes', () => {
            vi.useFakeTimers();
            vi.setSystemTime(1000);

            let captured: (() => void) | null = null,
                executed: number[] = [],
                q = new Queue<Task>(128),
                s = new Scheduler(q, (task) => { captured = task; });

            s.throttle(1, 1000);

            s.add(() => executed.push(1));
            s.add(() => executed.push(2));

            // First flush at t=1000
            captured!();

            expect(executed).toEqual([1]);

            // Try again too soon (interval = 1000ms / 1 = 1000ms)
            vi.setSystemTime(1500);

            captured!();

            // Should not have executed — interval not elapsed
            expect(executed).toEqual([1]);
            expect(s.length).toBe(1);

            // Advance past interval
            vi.setSystemTime(2001);

            captured!();

            expect(executed).toEqual([1, 2]);

            vi.useRealTimers();
        });

    });


    describe('re-entrancy', () => {

        it('tasks added during flush are scheduled for next flush', () => {
            let captured: (() => void) | null = null,
                executed: number[] = [],
                q = new Queue<Task>(128),
                schedulerCalls = 0,
                s = new Scheduler(q, (task) => { captured = task; schedulerCalls++; });

            s.add(() => {
                executed.push(1);
                // Add a new task during flush
                s.add(() => executed.push(3));
            });
            s.add(() => executed.push(2));

            // First flush
            captured!();

            // Tasks 1 and 2 executed; task 3 was added during flush
            expect(executed).toEqual([1, 2]);
            expect(s.length).toBe(1);

            // Scheduler should have been called again for the new task
            expect(schedulerCalls).toBe(2);

            // Second flush
            captured!();

            expect(executed).toEqual([1, 2, 3]);
            expect(s.length).toBe(0);
        });

    });

});
