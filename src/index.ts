import { Queue } from './queue';
import { Scheduler } from './scheduler';


const api = <T>(preallocate: number = 128) => {
    return new Queue<T>(preallocate);
};

api.immediate = () => {
    let { port1, port2 } = new MessageChannel();

    return new Scheduler(
        api(),
        (task) => {
            if (port1.onmessage !== task) {
                port1.onmessage = task;
            }

            port2.postMessage(null);
        }
    );
};

api.micro = () => {
    let queueMicrotask = globalThis?.queueMicrotask;

    if (queueMicrotask) {
        return new Scheduler(api(), (task) => queueMicrotask(task));
    }

    // Fallback: bind then() to resolved promise to preserve context
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