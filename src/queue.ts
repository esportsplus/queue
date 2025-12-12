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
    private pool: Node<T> | null = null;
    private preallocate: number;
    private size = 0;
    private tail: Node<T> | null = null;
    private tailIndex = 0;


    constructor(preallocate: number) {
        this.preallocate = preallocate;
    }


    private allocate(): Node<T> {
        let node = this.pool;

        if (node) {
            this.pool = node.next;
            node.next = null;
            return node;
        }

        return new Node<T>(this.preallocate);
    }

    private release(node: Node<T>) {
        node.next = this.pool;
        this.pool = node;
    }


    get length() {
        return this.size;
    }


    add(value: T) {
        let preallocate = this.preallocate,
            size = this.size,
            tail = this.tail,
            tailIndex = this.tailIndex;

        // First element
        if (tail === null) {
            tail = this.head = this.tail = this.allocate();
            tailIndex = 0;
        }
        // Reuse existing node if empty
        else if (size === 0) {
            tailIndex = 0;
            this.headIndex = 0;
        }
        // Current node full, get next from pool or allocate
        else if (tailIndex === preallocate) {
            tail = tail.next = this.allocate();
            tailIndex = 0;
            this.tail = tail;
        }

        tail.data[tailIndex] = value;
        this.tailIndex = tailIndex + 1;
        this.size = size + 1;
    }

    clear() {
        let head = this.head;

        // Move all nodes to pool
        while (head !== null) {
            let next = head.next;

            this.release(head);
            head = next;
        }

        this.head = null;
        this.headIndex = 0;
        this.size = 0;
        this.tail = null;
        this.tailIndex = 0;
    }

    next(): T | undefined {
        let size = this.size;

        if (size === 0) {
            return undefined;
        }

        let head = this.head!,
            headIndex = this.headIndex,
            preallocate = this.preallocate,
            value = head.data[headIndex];

        head.data[headIndex] = undefined;
        headIndex++;
        size--;

        // Current node exhausted, move to next
        if (headIndex === preallocate) {
            let next = head.next;

            this.release(head);
            this.head = next;
            headIndex = 0;

            if (next === null) {
                this.tail = null;
                this.tailIndex = 0;
            }
        }

        this.headIndex = headIndex;
        this.size = size;

        return value;
    }
}


export { Queue };