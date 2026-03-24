import { describe, expect, it } from 'vitest';

import api from '../src/index';


describe('api', () => {

    describe('factory', () => {

        it('api() returns Queue instance', () => {
            let q = api();

            expect(q).toHaveProperty('add');
            expect(q).toHaveProperty('clear');
            expect(q).toHaveProperty('length');
            expect(q).toHaveProperty('next');
        });

        it('api(256) passes custom preallocate', () => {
            let q = api<number>(2);

            q.add(1);
            q.add(2);
            q.add(3);

            expect(q.next()).toBe(1);
            expect(q.next()).toBe(2);
            expect(q.next()).toBe(3);
        });

    });


    describe('integration', () => {

        it('api.immediate() executes tasks asynchronously', async () => {
            let executed = false,
                scheduler = api.immediate();

            scheduler.add(() => { executed = true; });

            expect(executed).toBe(false);
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(executed).toBe(true);
        });

        it('api.micro() executes tasks as microtasks', async () => {
            let executed = false,
                scheduler = api.micro();

            scheduler.add(() => { executed = true; });

            expect(executed).toBe(false);
            await Promise.resolve().then(() => Promise.resolve());
            expect(executed).toBe(true);
        });

        it('api.raf() executes tasks on next frame (setTimeout fallback)', async () => {
            let executed = false,
                scheduler = api.raf();

            scheduler.add(() => { executed = true; });

            expect(executed).toBe(false);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(executed).toBe(true);
        });

    });


    describe('API', () => {

        it('chaining: .throttle().add().add()', () => {
            let scheduler = api.immediate().throttle(10, 1000).add(() => {}).add(() => {});

            expect(scheduler).toHaveProperty('add');
            expect(scheduler).toHaveProperty('schedule');
            expect(scheduler).toHaveProperty('throttle');
            expect(scheduler.length).toBe(2);
        });

    });

});
