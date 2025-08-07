class Node<T> {
    data: (T | undefined)[];
    next: Node<T> | null = null;

    constructor(size: number) {
        this.data = new Array<T | undefined>(size);
    }
}

class Queue<T> {
    private head: Node<T> | null = null;
    private headIndex = 0;
    private preallocate: number;
    private size: number = 0;
    private tail: Node<T> | null = null;
    private tailIndex = 0;


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
        // Clear current indexes to reuse existing arrays if empty
        else if (this.size === 0) {
            this.headIndex = 0;
            this.tailIndex = 0;
        }
        // Last array is full, add a new node
        else if (this.tailIndex === this.preallocate) {
            this.tail = this.tail.next = new Node<T>(this.preallocate);
            this.tailIndex = 0;
        }

        this.size++;
        this.tail.data[this.tailIndex++] = value;
    }

    clear() {
        while (this.head !== null) {
            let next = this.head.next;

            this.head.data.fill(undefined);
            this.head.next = null;
            this.head = next;
        }

        this.head = null;
        this.headIndex = 0;
        this.size = 0;
        this.tail = null;
        this.tailIndex = 0;
    }

    next(): T | undefined {
        if (this.size === 0) {
            return undefined;
        }

        let head = this.head!,
            value = head.data[this.headIndex];

        // This step is optional. It doesn't have a significant impact
        // on the behavior of the queue, but it's added for better
        // memory management.
        head.data[this.headIndex] = undefined;

        this.headIndex++;
        this.size--;

        // If the current array is empty, move to the next node
        if (this.headIndex === this.preallocate) {
            this.head = head.next;
            this.headIndex = 0;

            head.next = null;

            // If we removed the last node, reset the tail as well
            if (this.head === null) {
                this.tail = null;
                this.tailIndex = 0;
            }
        }

        return value;
    }
}


export default <T>(preallocate: number = 4096) => {
    return new Queue<T>(preallocate);
};