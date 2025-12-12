import { READY, RUNNING, SCHEDULED } from './constants';
import { Queue } from './queue';
import type { Task } from './types';


class Scheduler {
    private lastRunAt = 0;
    private queue: Queue<Task>;
    private scheduler: (task: () => void) => void;
    private state = READY;
    private task: () => void;
    private throttled: { interval: number; limit: number } | null = null;


    constructor(queue: Queue<Task>, scheduler: Scheduler['scheduler']) {
        this.queue = queue;
        this.scheduler = scheduler;
        this.task = () => this.run();
    }


    private run() {
        if (this.state === RUNNING) {
            return;
        }

        this.state = RUNNING;

        let elapsed = Date.now() - this.lastRunAt,
            throttle = this.throttled;

        if (!throttle || throttle.interval <= elapsed) {
            let q = this.queue,
                n = throttle?.limit ?? q.length;

            for (let i = 0; i < n; i++) {
                let task = q.next();

                if (!task) {
                    break;
                }

                task();
            }

            this.lastRunAt = Date.now();
        }

        this.state = READY;
        this.schedule();
    }


    get length() {
        return this.queue.length;
    }


    add(task: Task) {
        this.queue.add(task);
        this.schedule();
        return this;
    }

    schedule() {
        if (this.state !== READY || !this.queue.length) {
            return this;
        }

        this.state = SCHEDULED;
        this.scheduler(this.task);

        return this;
    }

    throttle(limit: number, ms: number) {
        this.throttled = {
            interval: ms / limit,
            limit
        };

        return this;
    }
}


export { Scheduler };