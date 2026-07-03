import { Queue } from './queue';
import { Scheduler } from './scheduler';


const api = <T>(preallocate: number = 128) => {
    return new Queue<T>(preallocate);
};

api.immediate = () => {
    let handler: (() => void) | null = null,
        { port1, port2 } = new MessageChannel(),
        port = port1 as typeof port1 & { ref?(): void; unref?(): void };

    return new Scheduler(
        api(),
        (task) => {
            if (handler === null) {
                handler = () => {
                    port.unref?.();
                    task();
                };
                port.onmessage = handler;
            }

            port.ref?.();
            port2.postMessage(null);
        }
    );
};

api.micro = () => {
    let queueMicrotask = globalThis?.queueMicrotask;

    if (queueMicrotask) {
        return new Scheduler(api(), (task) => queueMicrotask(task));
    }

    let resolved = Promise.resolve();

    return new Scheduler(api(), (task) => resolved.then(task));
};

api.raf = () => {
    let requestAnimationFrame = globalThis?.requestAnimationFrame;

    if (requestAnimationFrame) {
        return new Scheduler(api(), (task) => requestAnimationFrame(task));
    }

    return new Scheduler(api(), (task) => setTimeout(task, 16));
};


export default api;
export type { Queue, Scheduler };