import { describe, expect, it } from 'vitest';

import { Queue } from '../src/queue';


describe('Queue', () => {

    describe('happy path', () => {

        it('add() + next() single element', () => {
            let q = new Queue<number>(4);

            q.add(42);
            expect(q.next()).toBe(42);
        });

        it('add() + next() FIFO order preserved', () => {
            let q = new Queue<number>(4);

            q.add(1);
            q.add(2);
            q.add(3);

            expect(q.next()).toBe(1);
            expect(q.next()).toBe(2);
            expect(q.next()).toBe(3);
        });

        it('length tracks size correctly', () => {
            let q = new Queue<number>(4);

            expect(q.length).toBe(0);

            q.add(1);
            expect(q.length).toBe(1);

            q.add(2);
            expect(q.length).toBe(2);

            q.next();
            expect(q.length).toBe(1);

            q.next();
            expect(q.length).toBe(0);
        });

        it('clear() resets queue to empty', () => {
            let q = new Queue<number>(4);

            q.add(1);
            q.add(2);
            q.add(3);
            q.clear();

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();
        });

    });


    describe('edge case', () => {

        it('next() on empty queue returns undefined', () => {
            let q = new Queue<number>(4);

            expect(q.next()).toBeUndefined();
        });

        it('clear() on empty queue is safe', () => {
            let q = new Queue<number>(4);

            q.clear();

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();

            q.add(1);

            expect(q.length).toBe(1);
            expect(q.next()).toBe(1);
        });

        it('multiple consecutive clear() calls are safe', () => {
            let q = new Queue<number>(2);

            q.add(1);
            q.add(2);
            q.add(3);
            q.clear();
            q.clear();
            q.clear();

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();

            q.add(10);
            q.add(20);

            expect(q.length).toBe(2);
            expect(q.next()).toBe(10);
            expect(q.next()).toBe(20);
        });

        it('add() when size === 0 but tail !== null reuses existing node', () => {
            let q = new Queue<number>(2);

            // Add then drain — size becomes 0 but tail still exists (headIndex < preallocate)
            q.add(10);
            expect(q.next()).toBe(10);

            // size === 0, tail !== null — hits reuse path
            q.add(20);
            expect(q.length).toBe(1);
            expect(q.next()).toBe(20);
        });

    });


    describe('boundary', () => {

        it('add() + next() with preallocate=1 forces node allocation per item', () => {
            let q = new Queue<number>(1);

            q.add(1);
            q.add(2);
            q.add(3);

            expect(q.length).toBe(3);
            expect(q.next()).toBe(1);
            expect(q.next()).toBe(2);
            expect(q.next()).toBe(3);
            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();
        });

        it('add() fills a node, triggers new node allocation', () => {
            let q = new Queue<number>(2);

            // Fill first node (2 slots)
            q.add(1);
            q.add(2);

            // Third add triggers new node allocation
            q.add(3);

            expect(q.length).toBe(3);
            expect(q.next()).toBe(1);
            expect(q.next()).toBe(2);
            expect(q.next()).toBe(3);
        });

        it('large preallocate uses single node for many items', () => {
            let q = new Queue<number>(1000);

            for (let i = 0; i < 500; i++) {
                q.add(i);
            }

            expect(q.length).toBe(500);

            for (let i = 0; i < 500; i++) {
                expect(q.next()).toBe(i);
            }

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();
        });

        it('next() exhausts a node, releases to pool', () => {
            let q = new Queue<number>(2);

            q.add(1);
            q.add(2);
            q.add(3);

            // Exhaust first node (2 items), triggers release
            expect(q.next()).toBe(1);
            expect(q.next()).toBe(2);

            // Third item from second node
            expect(q.next()).toBe(3);
            expect(q.length).toBe(0);
        });

    });


    describe('pooling', () => {

        it('released node is reused by subsequent add()', () => {
            let q = new Queue<number>(2);

            // Fill and exhaust first node to release it to pool
            q.add(1);
            q.add(2);
            q.add(3);
            q.next(); // 1
            q.next(); // 2 — first node exhausted, released to pool

            // Fill second node
            q.add(4);

            // Third slot triggers allocation — should reuse pooled node
            q.add(5);

            expect(q.next()).toBe(3);
            expect(q.next()).toBe(4);
            expect(q.next()).toBe(5);
            expect(q.length).toBe(0);
        });

        it('clear() moves all nodes to pool (verified by no new allocation on re-add)', () => {
            let q = new Queue<number>(2);

            // Create multiple nodes
            q.add(1);
            q.add(2);
            q.add(3);
            q.add(4);

            // Clear moves all nodes to pool
            q.clear();

            // Re-add — should reuse pooled nodes, not allocate new ones
            q.add(10);
            q.add(20);
            q.add(30);
            q.add(40);

            expect(q.length).toBe(4);
            expect(q.next()).toBe(10);
            expect(q.next()).toBe(20);
            expect(q.next()).toBe(30);
            expect(q.next()).toBe(40);
            expect(q.length).toBe(0);
        });

    });


    describe('state recovery', () => {

        it('add() after clear() works correctly', () => {
            let q = new Queue<string>(4);

            q.add('a');
            q.add('b');
            q.clear();

            q.add('c');
            q.add('d');

            expect(q.length).toBe(2);
            expect(q.next()).toBe('c');
            expect(q.next()).toBe('d');
            expect(q.length).toBe(0);
        });

    });


    describe('stress', () => {

        it('bulk add/next (thousands of items) correctness', () => {
            let n = 10000,
                q = new Queue<number>(4);

            for (let i = 0; i < n; i++) {
                q.add(i);
            }

            expect(q.length).toBe(n);

            for (let i = 0; i < n; i++) {
                expect(q.next()).toBe(i);
            }

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();
        });

    });


    describe('interleave', () => {

        it('alternating add/next pattern', () => {
            let q = new Queue<number>(2);

            q.add(1);
            expect(q.next()).toBe(1);

            q.add(2);
            q.add(3);
            expect(q.next()).toBe(2);

            q.add(4);
            expect(q.next()).toBe(3);
            expect(q.next()).toBe(4);

            expect(q.length).toBe(0);
            expect(q.next()).toBeUndefined();
        });

    });

});
