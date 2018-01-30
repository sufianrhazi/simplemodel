export type ModelChangeHandler<T, K extends keyof T> = (curr: T[K], prev: T[K]) => void;
export type ModelAnyChangeHandler<T> = <K extends keyof T>(key: K, curr: T[typeof key], prev: T[typeof key]) => void;

export interface ModelBehavior<T> {

    /**
     * Listen for a change in any single property
     * 
     * @param key the property to listen for changes on
     * @param fn
     * @returns a function that removes the listener when called
     */
    on<K extends keyof T>(key: keyof T, fn: ModelChangeHandler<T, K>): () => void;

    /**
     * Listen for a change to any property
     * 
     * @param fn
     * @returns a function that removes the listener when called
     */
    onAny(fn: ModelAnyChangeHandler<T>): () => void;

    /**
     * Remove all listeners
     */
    offAll(): void;

    /**
     * Update multiple properties atomically
     * 
     * @param subset subset of properties to update at once
     */
    update(subset: Partial<T>): void;
}

export type Model<T> = ModelBehavior<T> & {
    [P in keyof T]: T[P];
};

export function makeModel<T extends {}>(val: T): Model<T> {
    let state = Object.assign({}, val) as T;
    let listeners: { [K in keyof T]?: ModelChangeHandler<T, K>[] } = {};
    let anyListeners: ModelAnyChangeHandler<T>[] = [];
    let model: ModelBehavior<T> = Object.defineProperties({}, {
        on: {
            value: <K extends keyof T>(key: K, fn: ModelChangeHandler<T, K>): (() => void) => {
                let arr = listeners[key];
                if (arr !== undefined) {
                    arr.push(fn);
                } else {
                    listeners[key] = [fn];
                }
                return () => {
                    let arr = listeners[key];
                    if (arr) {
                        listeners[key] = arr.filter(f => f !== fn);
                    }
                };
            }
        },
        onAny: {
            value: (fn: ModelAnyChangeHandler<T>): (() => void) => {
                anyListeners.push(fn);
                return () => {
                    anyListeners = anyListeners.filter(f => f !== fn);
                }
            }
        },
        offAll: {
            value: (): void => {
                listeners = {};
                anyListeners = [];
            }
        },
        update: {
            value: (subset: Partial<T>): void => {
                const prev = Object.assign({}, state) as typeof state;
                state = Object.assign(state, subset);
                let changed: { [K in keyof T]?: [T[K],T[K]] } = {};
                for (let k in subset) {
                    var arr = listeners[k];
                    if (arr !== undefined) {
                        arr.forEach(fn => fn(state[k], prev[k]));
                    }
                    anyListeners.forEach(fn => fn(k, state[k], prev[k]));
                }
            }
        },
    });
    for (let key in val) {
        Object.defineProperty(model, key, {
            get: () => state[key],
            set: (newVal: T[typeof key]) => {
                var oldVal = state[key];
                state[key] = newVal;
                var handlers = listeners[key];
                if (handlers) {
                    handlers.forEach(fn => fn(newVal, oldVal))
                }
                anyListeners.forEach(fn => fn(key, newVal, oldVal));
            },
            enumerable: true
        });
    }
    return model as Model<T>;
}


export type CollectionItemListener<T> = (item: T, index: number) => void;
export type CollectionResetListener<T> = () => void;

export class Collection<T> implements Iterable<T> {
    private items: T[];
    private cmp: undefined | ((a: T, b: T) => number);
    private addListeners: CollectionItemListener<T>[];
    private removeListeners: CollectionItemListener<T>[];
    private resetListeners: CollectionResetListener<T>[];
    private anyListeners: CollectionResetListener<T>[];

    constructor(items: T[], cmp?: (a: T, b: T) => number) {
        this.items = Array.from(items);
        if (cmp) {
            this.cmp = cmp;
            this.items.sort(this.cmp);
        }
        this.addListeners = [];
        this.removeListeners = [];
        this.resetListeners = [];
        this.anyListeners = [];
        const that = this;
        return new Proxy(this, {
            get(target, property, handler): any {
                let idx: number | undefined;
                if (typeof(property) === 'number') {
                    return that.items[property]; // TODO: either the ES6 spec is misleading and proprty *may* be a number, or Typescript's PropertyKey type is incorrect.
                } else if (typeof(property) === 'string' && (idx = parseInt(property)).toString() === property) {
                    return that.items[idx];
                } else {
                    return (target as any)[property];
                }
            }    
        });
    }

    /**
     * The number of items in this collection
     */
    get length(): number {
        return this.items.length;
    }

    [index: number]: T | undefined;

    /**
     * Listen for items added to this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'add', handler: CollectionItemListener<T>): () => void;
    /**
     * Listen for items removed from this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'remove', handler: CollectionItemListener<T>): () => void;
    /**
     * Listen for a complete replacement of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'reset', handler: CollectionResetListener<T>): () => void;
    on(name: 'add' | 'remove' | 'reset', handler: CollectionItemListener<T> | CollectionResetListener<T>): () => void {
        if (name === 'add') {
            this.addListeners.push(handler as CollectionItemListener<T>);
            return () => {
                this.addListeners = this.addListeners.filter(f => f !== handler);
            };
        } else if (name === 'remove') {
            this.removeListeners.push(handler as CollectionItemListener<T>);
            return () => {
                this.removeListeners = this.removeListeners.filter(f => f !== handler);
            };
        } else if (name === 'reset') {
            this.resetListeners.push(handler as CollectionResetListener<T>);
            return () => {
                this.resetListeners = this.resetListeners.filter(f => f !== handler);
            };
        }
        throw new Error('TODO: how to tell typescript this is unreachable?');
    }

    /**
     * Listen for any change to the set of items in this collection
     * @returns a function that removes the listener when called
     */
    onAny(handler: CollectionResetListener<T>): () => void {
        this.anyListeners.push(handler);
        return () => {
            this.anyListeners = this.anyListeners.filter(f => f !== handler);
        };
    }

    /**
     * Remove all listeners
     */
    offAll(): void {
        this.addListeners = [];
        this.removeListeners = [];
        this.resetListeners = [];
        this.anyListeners = [];
    }

    /**
     * Add an item to the collection. If sorted, the item will be placed at the
     * correctly sorted index.
     */
    add(item: T): void {
        let index: undefined | number;
        if (this.cmp === undefined || this.items.length === 0) {
            index = this.items.length;
            this.items.push(item);
        } else {
            let l = 0;
            let r = this.items.length - 1;
            let m = 0;
            while (l <= r) {
                m = Math.floor((r - l) / 2) + l;
                const comparison = this.cmp(this.items[m], item);
                if (comparison < 0) {
                    l = m + 1;
                } else if (comparison > 0) {
                    r = m - 1;
                } else {
                    break; // found match, insert here
                }
            }
            // items[m] is closest
            if (this.cmp(item, this.items[m]) < 0) { // less than items[m]? insert before
                index = m;
            } else { // greater than or equal to items[m]? insert after
                index = m + 1;
            }
            this.items.splice(index, 0, item);
        }
        this.addListeners.forEach(fn => fn(item, index!));
        this.anyListeners.forEach(fn => fn());
    }

    /**
     * Remove an item from the collection
     * @returns true if an item was removed
     */
    remove(item: T): boolean {
        var index = this.items.indexOf(item);
        if (index === -1) {
            return false;
        }
        this.items.splice(index, 1);
        this.removeListeners.forEach(fn => fn(item, index));
        this.anyListeners.forEach(fn => fn());
        return true;
    }

    /**
     * Remove an item at a specific index
     * @param index the index to remove
     * @returns true if an item is removed
     */
    removeAt(index: number): boolean {
        if (index >= 0 && index < this.items.length) {
            var item = this.items[index];
            this.items.splice(index, 1);
            this.removeListeners.forEach(fn => fn(item, index));
            this.anyListeners.forEach(fn => fn());
            return true;
        }
        return false;
    }

    /**
     * Replace all items in the collection
     * @param newItems the replacement items
     */
    reset(newItems: T[]): void {
        const olldItems = this.items;
        this.items = Array.from(newItems);
        if (this.cmp) {
            this.items.sort(this.cmp);
        }
        this.resetListeners.forEach(fn => fn());
        this.anyListeners.forEach(fn => fn());
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this.items[Symbol.iterator]();
    }

    /**
     * Returns an iterable of key, value pairs for every entry in the array
     */
    get entries() {
        return this.items.entries();
    }

    /**
     * Return true if all members satisfy a predicate
     * @param fn a test predicate
     * @returns true if all members satisfy a predicate
     */
    every(fn: (val: T, index: number) => boolean): boolean {
        return this.items.every(fn);
    }

    /**
     * Call a visitor function for every item in the array
     * @param fn the visitor function
     */
    forEach(fn: (item: T, index: number, arr: T[]) => void): void {
        this.items.forEach(fn);
    }

    /**
     * Return the first member of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the item found or `undefined` if missing
     */
    find(fn: (item: T, index: number, arr: T[]) => boolean): T | undefined {
        return this.items.find(fn);
    }

    /**
     * Return the index of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the index if found or `-1` if missing
     */
    findIndex(fn: (item: T, index: number, arr: T[]) => boolean): number {
        return this.items.findIndex(fn);
    }

    /**
     * Return true if the item is present in the collection
     * @param val the item to locate
     */
    includes(val: T): boolean {
        return this.items.includes(val);
    }

    /**
     * Return the index of the item in the collection
     * @param val the item to locate
     * @returns the index if found or `-1` if missing
     */
    indexOf(val: T): number {
        return this.items.indexOf(val);
    }

    /**
     * Calls a defined callback function on each element of an array, and
     * returns an array that contains the results
     * @param fn the callback function
     * @returns an array of produced values
     */
    map<V>(fn: (val: T, index: number) => V): V[] {
        return this.items.map(fn);
    }

    /**
     * Return an array of items which pass a predicate
     * @param fn the predicate function
     * @returns an array of values which pass the predicate
     */
    filter(fn: (val: T, index: number) => boolean): T[] {
        return this.items.filter(fn);
    }

    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduce(fn: (acc: T, curr: T, index: number) => T): T;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce(fn: (acc: T, curr: T, index: number) => T, acc: T): T;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce<V>(fn: (acc: V, curr: T, index: number) => V, acc?: V): V;
    reduce<V>(fn: (acc: V | T, curr: T, index: number) => V | T, acc?: V): V | T {
        if (arguments.length < 2) {
            return this.items.reduce(fn as (acc: T, curr: T, index: number) => T);
        } else {
            return this.items.reduce(fn as (acc: V, curr: T, index: number) => V, acc as V);
        }
    }

    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: T, curr: T, index: number) => T): T;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: T, curr: T, index: number) => T, acc: T): T;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight<V>(fn: (acc: V, curr: T, index: number) => V, acc?: V): V;
    reduceRight<V>(fn: (acc: T | V, curr: T, index: number) => T | V, acc?: T | V): T | V {
        if (arguments.length < 2) {
            return this.items.reduceRight(fn as (acc: T, curr: T, index: number) => T);
        } else {
            return this.items.reduceRight(fn as (acc: V, curr: T, index: number) => V, acc as V);
        }
    }

    /**
     * Return true if any members satisfy a predicate
     * @param fn a test predicate
     * @returns true if any members satisfy a predicate
     */
    some(fn: (val: T, index: number) => boolean): boolean {
        return this.items.some(fn);
    }
}

export function makeCollection<T>(items: T[], cmp?: (a: T, b: T) => number): Collection<T> {
    return new Collection(items, cmp);
};