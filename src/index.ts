class Node<T> {
    data: (T | undefined)[];
    index: number = 0;
    next: Node<T> | null = null;

    constructor(size: number) {
        this.data = new Array<T | undefined>(size);
    }
}

class Queue<T> {
    private head: Node<T> | null = null;
    private preallocate: number;
    private size: number = 0;
    private tail: Node<T> | null = null;


    constructor(preallocate: number) {
        this.preallocate = preallocate;
    }


    get length() {
        return this.size;
    }


    add(value: T) {
        // First element, initialize the linked list
        if (this.tail === null) {
            this.head = this.tail = new Node<T>(this.preallocate);
        }
        // Last array is full, add a new node
        else if (this.tail.index === this.preallocate) {
            this.tail = this.tail.next = new Node<T>(this.preallocate);
        }

        this.tail.data[this.tail.index++] = value;
        this.size++;
    }

    clear() {
        this.head = null;
        this.size = 0;
        this.tail = null;
    }

    next(): T | undefined {
        if (this.size === 0) {
            return undefined;
        }

        let head = this.head!,
            value = head.data[head.index];

        // This step is optional and may not be required.
        // It doesn't actually have a significant impact on the behavior of the queue, but is added for better memory management.
        head.data[head.index] = undefined;
        head.index++;
        this.size--;

        // If the current array is empty, move to the next node
        if (head.index === this.preallocate) {
            this.head = head.next;

            // If we removed the last node, reset the tail as well
            if (this.head === null) {
                this.tail = null;
            }
        }

        return value;
    }
}


export default <T>(preallocate: number = 4096) => {
    return new Queue<T>(preallocate);
};