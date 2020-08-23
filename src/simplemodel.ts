export type ModelChangeHandler<M, K extends keyof M> = (curr: M[K], prev: M[K]) => void;
export type ModelAnyChangeHandler<M> = <K extends keyof M>(key: K, curr: M[typeof key], prev: M[typeof key]) => void;

const ModelTag = Symbol('Model');

function isModel<T>(obj: T): obj is Model<T> {
    return !!(obj as any)[ModelTag];
}

export interface ModelBehavior<M extends {}> {
    [ModelTag]: true;

    /**
     * Listen for a change in any single property
     * 
     * @param key the property to listen for changes on
     * @param fn
     * @returns a function that removes the listener when called
     */
    on<K extends keyof M>(key: K, fn: ModelChangeHandler<M, K>): () => void;

    /**
     * Listen for a change to any property
     * 
     * @param fn
     * @returns a function that removes the listener when called
     */
    onAny(fn: ModelAnyChangeHandler<M>): () => void;

    /**
     * Remove all listeners
     */
    offAll(): void;

    /**
     * Update multiple properties atomically
     * 
     * @param subset subset of properties to update at once
     */
    update(subset: Partial<M>): void;
};

export type Model<M extends {}> = ModelBehavior<M> & M;

export function makeModel<M extends {}>(val: M): Model<M> {
    let state = Object.assign({}, val);
    let listeners: { [K in keyof M]?: ModelChangeHandler<M, K>[] } = {};
    let anyListeners: ModelAnyChangeHandler<M>[] = [];
    let model: ModelBehavior<M> = Object.defineProperties({
        [ModelTag]: true,
    }, {
        on: {
            value: <K extends keyof M>(key: K, fn: ModelChangeHandler<M, K>): (() => void) => {
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
            value: (fn: ModelAnyChangeHandler<M>): (() => void) => {
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
            value: (subset: Partial<M>): void => {
                const prev = Object.assign({}, state) as typeof state;
                state = Object.assign(state, subset);
                let changed: { [K in keyof M]?: [M[K],M[K]] } = {};
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
            set: (newVal: M[typeof key]) => {
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
    return model as Model<M>;
}

export type ModelCollectionItemListener<M> = (item: Model<M>, index: number) => void;
export type ModelCollectionResetListener<M> = () => void;
export type ModelCollectionSortListener<M> = () => void;
export type ModelCollectionChangeListener<K extends keyof M,M> = (item: Model<M>, index: number, field: K, curr: M[typeof field], prev: M[typeof field]) => void;

export class ModelCollection<M> implements Iterable<M>, Array<Model<M>> {
    private items: Model<M>[];
    private cmp: undefined | ((a: Model<M>, b: Model<M>) => number);
    private addListeners: ModelCollectionItemListener<M>[];
    private removeListeners: ModelCollectionItemListener<M>[];
    private resetListeners: ModelCollectionResetListener<M>[];
    private sortListeners: ModelCollectionSortListener<M>[];
    private anyListeners: ModelCollectionResetListener<M>[];
    private changeListeners: ModelCollectionChangeListener<keyof M,M>[];
    private modelListenerMap: WeakMap<M & object,() => void>;

    constructor(items: Model<M>[], cmp?: (a: Model<M>, b: Model<M>) => number) {
        this.addListeners = [];
        this.removeListeners = [];
        this.resetListeners = [];
        this.sortListeners = [];
        this.anyListeners = [];
        this.changeListeners = [];
        this.modelListenerMap = new WeakMap();
        this.items = Array.from(items);
        if (cmp) {
            this.cmp = cmp;
            this.items.sort(this.cmp);
        }
        this.items.forEach(item => this.track(item));
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

    [index: number]: Model<M>;

    /**
     * Listen for items added to this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'add', handler: ModelCollectionItemListener<M>): () => void;
    /**
     * Listen for items removed from this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'remove', handler: ModelCollectionItemListener<M>): () => void;
    /**
     * Listen for a complete replacement of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'reset', handler: ModelCollectionResetListener<M>): () => void;
    /**
     * Listen for a complete sort of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'sort', handler: ModelCollectionSortListener<M>): () => void;
    /**
     * If the collection contains Model instances, listen for changes to any
     * of the Models in the collection.
     * @returns a function that removes the listener when called
     */
    on(name: 'change', handler: ModelCollectionChangeListener<keyof M,M>): () => void;
    on(name: 'add' | 'remove' | 'reset' | 'sort' | 'change', handler: ModelCollectionItemListener<M> | ModelCollectionResetListener<M> | ModelCollectionSortListener<M> | ModelCollectionChangeListener<keyof M,M>): () => void {
        if (name === 'add') {
            this.addListeners.push(handler as ModelCollectionItemListener<M>);
            return () => {
                this.addListeners = this.addListeners.filter(f => f !== handler);
            };
        } else if (name === 'remove') {
            this.removeListeners.push(handler as ModelCollectionItemListener<M>);
            return () => {
                this.removeListeners = this.removeListeners.filter(f => f !== handler);
            };
        } else if (name === 'reset') {
            this.resetListeners.push(handler as ModelCollectionResetListener<M>);
            return () => {
                this.resetListeners = this.resetListeners.filter(f => f !== handler);
            };
        } else if (name === 'sort') {
            this.sortListeners.push(handler as ModelCollectionSortListener<M>);
            return () => {
                this.sortListeners = this.sortListeners.filter(f => f !== handler);
            };
        } else if (name === 'change') {
            this.changeListeners.push(handler as ModelCollectionChangeListener<keyof M,M>);
            return () => {
                this.changeListeners = this.changeListeners.filter(f => f !== handler);
            };
        }
        throw new Error('TODO: how to tell typescript this is unreachable?');
    }

    /**
     * Listen for any change to the set of items in this collection
     * @returns a function that removes the listener when called
     */
    onAny(handler: ModelCollectionResetListener<M>): () => void {
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
        this.sortListeners = [];
        this.anyListeners = [];
        this.changeListeners = [];
    }

    /**
     * Add a Model to the collection.
     * If sorted, the item will be placed at the correctly sorted index with
     * O(lg(n)) comparisons.
     */
    add(item: M | Model<M>): void {
        let itemToAdd = isModel(item) ? item : makeModel(item);
        let index: undefined | number;
        if (this.cmp === undefined || this.items.length === 0) {
            index = this.items.length;
            this.items.push(itemToAdd);
        } else {
            let low = 0;
            let hi = this.items.length;
            index = 0;
            while (hi - low > 1) {
                index = low + Math.floor((hi - low) / 2);
                let c = this.cmp(itemToAdd, this.items[index]);
                if (c >= 0) {
                    low = index;
                } else {
                    hi = index;
                }
            }
            let c = this.cmp(itemToAdd, this.items[index]);
            if (c >= 0) {
                index = index + 1;
            }
            this.items.splice(index, 0, itemToAdd);
        }
        this.track(itemToAdd);
        this.addListeners.forEach(fn => fn(itemToAdd, index!));
        this.anyListeners.forEach(fn => fn());
    }

    private track(item: Model<M>) {
        const off = item.onAny((field, curr, prev) => {
            const index = this.indexOf(item);
            this.changeListeners.forEach(fn => fn(item as any, index, field, curr, prev));
        });
        this.modelListenerMap.set(item, off);
    }

    private cleanUp(item: Model<M>) {
        const off = this.modelListenerMap.get(item);
        if (off) {
            off();
            this.modelListenerMap.delete(item);
        }
    }

    /**
     * Remove an item from the collection
     * @returns true if an item was removed
     */
    remove(item: Model<M>): boolean {
        var index = this.items.indexOf(item);
        if (index === -1) {
            return false;
        }
        this.items.splice(index, 1);
        this.removeListeners.forEach(fn => fn(item, index));
        this.anyListeners.forEach(fn => fn());
        this.cleanUp(item);
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
            this.cleanUp(item);
            return true;
        }
        return false;
    }

    /**
     * Replace all items in the collection
     * @param newItems the replacement items
     */
    reset(newItems: Model<M>[]): void {
        const oldItems = this.items;
        oldItems.forEach(item => this.cleanUp(item));
        this.items = Array.from(newItems);
        if (this.cmp) {
            this.items.sort(this.cmp);
        }
        this.items.forEach(item => this.track(item));
        this.resetListeners.forEach(fn => fn());
        this.anyListeners.forEach(fn => fn());
    }

    [Symbol.iterator](): IterableIterator<Model<M>> {
        return this.items[Symbol.iterator]();
    }

    /**
     * Returns an iterable of key, value pairs for every entry in the array
     */
    entries(): IterableIterator<[number, Model<M>]> {
        return this.items.entries();
    }

    /**
     * Return true if all members satisfy a predicate
     * @param fn a test predicate
     * @returns true if all members satisfy a predicate
     */
    every(fn: (val: Model<M>, index: number, array: Model<M>[]) => boolean): boolean {
        return this.items.every(fn);
    }

    /**
     * Call a visitor function for every item in the array
     * @param fn the visitor function
     */
    forEach(fn: (item: Model<M>, index: number, arr: Model<M>[]) => void): void {
        this.items.forEach(fn);
    }

    /**
     * Return the first member of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the item found or `undefined` if missing
     */
    find(fn: (item: Model<M>, index: number, arr: Model<M>[]) => boolean): Model<M> | undefined {
        return this.items.find(fn);
    }

    /**
     * Return the index of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the index if found or `-1` if missing
     */
    findIndex(fn: (item: Model<M>, index: number, arr: Model<M>[]) => boolean): number {
        return this.items.findIndex(fn);
    }

    /**
     * Return true if the item is present in the collection
     * @param val the item to locate
     */
    includes(val: Model<M>): boolean {
        return this.items.includes(val);
    }

    /**
     * Return the index of the item in the collection
     * @param val the item to locate
     * @returns the index if found or `-1` if missing
     */
    indexOf(val: Model<M>): number {
        return this.items.indexOf(val);
    }

    /**
     * Return the last index of the item in the collection
     * @param val the item to locate
     * @returns the index if found or `-1` if missing
     */
    lastIndexOf(val: Model<M>): number {
        return this.items.lastIndexOf(val);
    }

    /**
     * Calls a defined callback function on each element of an array, and
     * returns an array that contains the results
     * @param fn the callback function
     * @returns an array of produced values
     */
    map<V>(fn: (val: Model<M>, index: number, arr: Model<M>[]) => V): V[] {
        return this.items.map(fn);
    }

    /**
     * Return an array of items which pass a predicate
     * @param fn the predicate function
     * @returns an array of values which pass the predicate
     */
    filter(fn: (val: Model<M>, index: number, arr: Model<M>[]) => boolean): Model<M>[] {
        return this.items.filter(fn);
    }

    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduce(fn: (acc: Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M>): Model<M>;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce(fn: (acc: Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M>, acc: Model<M>): Model<M>;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce<V>(fn: (acc: V, curr: Model<M>, index: number, arr: Model<M>[]) => V, acc?: V): V;
    reduce<V>(fn: (acc: V | Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => V | Model<M>, acc?: V): V | Model<M> {
        if (arguments.length < 2) {
            return this.items.reduce(fn as (acc: Model<M>, curr: Model<M>, index: number) => Model<M>);
        } else {
            return this.items.reduce(fn as (acc: V, curr: Model<M>, index: number) => V, acc as V);
        }
    }

        /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M>): Model<M>;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M>, acc: Model<M>): Model<M>;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight<V>(fn: (acc: V, curr: Model<M>, index: number, arr: Model<M>[]) => V, acc?: V): V;
    reduceRight<V>(fn: (acc: Model<M> | V, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M> | V, acc?: Model<M> | V): Model<M> | V {
        if (arguments.length < 2) {
            return this.items.reduceRight(fn as (acc: Model<M>, curr: Model<M>, index: number, arr: Model<M>[]) => Model<M>);
        } else {
            return this.items.reduceRight(fn as (acc: V, curr: Model<M>, index: number, arr: Model<M>[]) => V, acc as V);
        }
    }

    /**
     * Return true if any members satisfy a predicate
     * @param fn a test predicate
     * @returns true if any members satisfy a predicate
     */
    some(fn: (val: Model<M>, index: number, arr: Model<M>[]) => boolean): boolean {
        return this.items.some(fn);
    }

    /**
     * Sort the collection and set the comparison function to be cmp (if provided)
     * Unlike native Array.prototype.sort(), this sort is stable (simple mergesort).
     * @param cmp the comparison function
     */
    sort(cmp?: (a: Model<M>, b: Model<M>) => number): this {
        if (arguments.length > 0) {
            this.cmp = cmp;
        }
        if (this.cmp !== undefined) {
            this._mergesort();
            this.sortListeners.forEach(fn => fn());
        }
        return this;
    }

    /**
     * Remove the last item in the array
     * @return the last item in the array
     */
    pop(): Model<M> | undefined {
        return this.items.pop();
    }

    /**
     * Insert an item to the end the array, equivalent to .add() when sorted
     * @param item the item to add
     * @return the new length of the array
     */
    push(item: Model<M>): number {
        if (this.cmp !== undefined) {
            this.add(item);
        } else {
            this.items.push(item);
        }
        return this.length;
    }
    /**
     * Insert an item to the front of the array, equivalent to .add() when sorted
     * @param item the item to add
     * @return the new length of the array
     */
    unshift(item: Model<M>): number {
        if (this.cmp !== undefined) {
            this.add(item);
        } else {
            this.items.unshift(item);
        }
        return this.length;
    }

    /**
     * Combines two or more arrays
     * @param items 
     */
    concat(...items: ConcatArray<Model<M>>[]): Model<M>[] {
        return this.items.concat(...items);
    }

    /**
     * Join the items in the array with a string joiner
     */
    join(joiner: string): string {
        return this.items.join(joiner);
    }
    
    /**
     * Remove and return the first item in the collection
     */
    shift(): Model<M> | undefined {
        return this.items.shift();
    }
    
    /**
     * Return a subsection copy of the collection
     * @param start index to start
     * @param end index to end
     */
    slice(start?: number, end?: number): Model<M>[] {
        return this.items.slice(start, end);
    } 

    private _mergesort(): void {
        var dest = this.items;
        var src = Array.from(dest);
        this._mergesortRecurse(0, src, dest, src.length);
    }

    private _mergesortRecurse(low: number, src: Model<M>[], dst: Model<M>[], hi: number): void {
        if (hi - low < 2) return;
        var mid = low + Math.floor((hi - low) / 2);
        this._mergesortRecurse(low, dst, src, mid);
        this._mergesortRecurse(mid, dst, src, hi);
        var i = low;
        var j = mid;
        for (var k = low; k < hi; ++k) {
            if (i < mid && (j >= hi || this.cmp!(src[i], src[j]) <= 0)) {
                dst[k] = src[i];
                ++i;
            } else {
                dst[k] = src[j];
                ++j;
            }
        }
    }

    reverse(): Model<M>[] {
        throw new Error("Not supported");
    }
    
    splice(): Model<M>[] {
        throw new Error("Not supported");
    }

    fill(): this {
        throw new Error("Not supported");
    }
    
    copyWithin(): this {
        throw new Error("Not supported");
    }
    
    keys(): IterableIterator<number> {
        throw new Error("Unsupported");
    }
    
    values(): IterableIterator<Model<M>> {
        throw new Error("Unsupported");
    }

    [Symbol.unscopables] = Array.prototype[Symbol.unscopables];
}

export function makeModelCollection<T>(items: (Model<T> | T)[], cmp?: (a: Model<T>, b: Model<T>) => number): ModelCollection<T> {
    const modelItems = items.map(item => isModel(item) ? item : makeModel(item));
    return new ModelCollection<T>(modelItems, cmp);
};


export type SimpleCollectionItemListener<M> = (item: M, index: number) => void;
export type SimpleCollectionResetListener<M> = () => void;
export type SimpleCollectionSortListener<M> = () => void;

export class SimpleCollection<M> implements Iterable<M>, Array<M> {
    private items: M[];
    private cmp: undefined | ((a: M, b: M) => number);
    private addListeners: SimpleCollectionItemListener<M>[];
    private removeListeners: SimpleCollectionItemListener<M>[];
    private resetListeners: SimpleCollectionResetListener<M>[];
    private sortListeners: SimpleCollectionSortListener<M>[];
    private anyListeners: SimpleCollectionResetListener<M>[];

    constructor(items: M[], cmp?: (a: M, b: M) => number) {
        this.addListeners = [];
        this.removeListeners = [];
        this.resetListeners = [];
        this.sortListeners = [];
        this.anyListeners = [];
        this.items = Array.from(items);
        if (cmp) {
            this.cmp = cmp;
            this.items.sort(this.cmp);
        }
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

    [index: number]: M;

    /**
     * Listen for items added to this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'add', handler: SimpleCollectionItemListener<M>): () => void;
    /**
     * Listen for items removed from this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'remove', handler: SimpleCollectionItemListener<M>): () => void;
    /**
     * Listen for a complete replacement of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'reset', handler: SimpleCollectionResetListener<M>): () => void;
    /**
     * Listen for a complete sort of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'sort', handler: SimpleCollectionSortListener<M>): () => void;
    on(name: 'add' | 'remove' | 'reset' | 'sort', handler: SimpleCollectionItemListener<M> | SimpleCollectionResetListener<M> | SimpleCollectionSortListener<M>): () => void {
        if (name === 'add') {
            this.addListeners.push(handler as SimpleCollectionItemListener<M>);
            return () => {
                this.addListeners = this.addListeners.filter(f => f !== handler);
            };
        } else if (name === 'remove') {
            this.removeListeners.push(handler as SimpleCollectionItemListener<M>);
            return () => {
                this.removeListeners = this.removeListeners.filter(f => f !== handler);
            };
        } else if (name === 'reset') {
            this.resetListeners.push(handler as SimpleCollectionResetListener<M>);
            return () => {
                this.resetListeners = this.resetListeners.filter(f => f !== handler);
            };
        } else if (name === 'sort') {
            this.sortListeners.push(handler as SimpleCollectionSortListener<M>);
            return () => {
                this.sortListeners = this.sortListeners.filter(f => f !== handler);
            };
        }
        throw new Error('TODO: how to tell typescript this is unreachable?');
    }

    /**
     * Listen for any change to the set of items in this collection
     * @returns a function that removes the listener when called
     */
    onAny(handler: SimpleCollectionResetListener<M>): () => void {
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
        this.sortListeners = [];
        this.anyListeners = [];
    }

    /**
     * Add a Model to the collection.
     * If sorted, the item will be placed at the correctly sorted index with
     * O(lg(n)) comparisons.
     */
    add(item: M): void {
        let index: undefined | number;
        if (this.cmp === undefined || this.items.length === 0) {
            index = this.items.length;
            this.items.push(item);
        } else {
            let low = 0;
            let hi = this.items.length;
            index = 0;
            while (hi - low > 1) {
                index = low + Math.floor((hi - low) / 2);
                let c = this.cmp(item, this.items[index]);
                if (c >= 0) {
                    low = index;
                } else {
                    hi = index;
                }
            }
            let c = this.cmp(item, this.items[index]);
            if (c >= 0) {
                index = index + 1;
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
    remove(item: M): boolean {
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
    reset(newItems: M[]): void {
        this.items = Array.from(newItems);
        if (this.cmp) {
            this.items.sort(this.cmp);
        }
        this.resetListeners.forEach(fn => fn());
        this.anyListeners.forEach(fn => fn());
    }

    [Symbol.iterator](): IterableIterator<M> {
        return this.items[Symbol.iterator]();
    }

    /**
     * Returns an iterable of key, value pairs for every entry in the array
     */
    entries(): IterableIterator<[number, M]> {
        return this.items.entries();
    }

    /**
     * Return true if all members satisfy a predicate
     * @param fn a test predicate
     * @returns true if all members satisfy a predicate
     */
    every(fn: (val: M, index: number, array: M[]) => boolean): boolean {
        return this.items.every(fn);
    }

    /**
     * Call a visitor function for every item in the array
     * @param fn the visitor function
     */
    forEach(fn: (item: M, index: number, arr: M[]) => void): void {
        this.items.forEach(fn);
    }

    /**
     * Return the first member of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the item found or `undefined` if missing
     */
    find(fn: (item: M, index: number, arr: M[]) => boolean): M | undefined {
        return this.items.find(fn);
    }

    /**
     * Return the index of the collection that passes a predicate
     * @param fn the predicate test
     * @returns the index if found or `-1` if missing
     */
    findIndex(fn: (item: M, index: number, arr: M[]) => boolean): number {
        return this.items.findIndex(fn);
    }

    /**
     * Return true if the item is present in the collection
     * @param val the item to locate
     */
    includes(val: M): boolean {
        return this.items.includes(val);
    }

    /**
     * Return the index of the item in the collection
     * @param val the item to locate
     * @returns the index if found or `-1` if missing
     */
    indexOf(val: M): number {
        return this.items.indexOf(val);
    }

    /**
     * Return the last index of the item in the collection
     * @param val the item to locate
     * @returns the index if found or `-1` if missing
     */
    lastIndexOf(val: M): number {
        return this.items.lastIndexOf(val);
    }

    /**
     * Calls a defined callback function on each element of an array, and
     * returns an array that contains the results
     * @param fn the callback function
     * @returns an array of produced values
     */
    map<V>(fn: (val: M, index: number, arr: M[]) => V): V[] {
        return this.items.map(fn);
    }

    /**
     * Return an array of items which pass a predicate
     * @param fn the predicate function
     * @returns an array of values which pass the predicate
     */
    filter(fn: (val: M, index: number, arr: M[]) => boolean): M[] {
        return this.items.filter(fn);
    }

    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduce(fn: (acc: M, curr: M, index: number, arr: M[]) => M): M;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce(fn: (acc: M, curr: M, index: number, arr: M[]) => M, acc: M): M;
    /**
     * Accumulate a value constructed by visiting each item in the collection
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduce<V>(fn: (acc: V, curr: M, index: number, arr: M[]) => V, acc?: V): V;
    reduce<V>(fn: (acc: V | M, curr: M, index: number, arr: M[]) => V | M, acc?: V): V | M {
        if (arguments.length < 2) {
            return this.items.reduce(fn as (acc: M, curr: M, index: number) => M);
        } else {
            return this.items.reduce(fn as (acc: V, curr: M, index: number) => V, acc as V);
        }
    }

        /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: M, curr: M, index: number, arr: M[]) => M): M;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight(fn: (acc: M, curr: M, index: number, arr: M[]) => M, acc: M): M;
    /**
     * Accumulate a value constructed by visiting each item in the collection in reverse
     * @param fn the accumulator function
     * @param acc the initial value of the accumulator
     * @returns the accumulated value
     */
    reduceRight<V>(fn: (acc: V, curr: M, index: number, arr: M[]) => V, acc?: V): V;
    reduceRight<V>(fn: (acc: M | V, curr: M, index: number, arr: M[]) => M | V, acc?: M | V): M | V {
        if (arguments.length < 2) {
            return this.items.reduceRight(fn as (acc: M, curr: M, index: number, arr: M[]) => M);
        } else {
            return this.items.reduceRight(fn as (acc: V, curr: M, index: number, arr: M[]) => V, acc as V);
        }
    }

    /**
     * Return true if any members satisfy a predicate
     * @param fn a test predicate
     * @returns true if any members satisfy a predicate
     */
    some(fn: (val: M, index: number, arr: M[]) => boolean): boolean {
        return this.items.some(fn);
    }

    /**
     * Sort the collection and set the comparison function to be cmp (if provided)
     * Unlike native Array.prototype.sort(), this sort is stable (simple mergesort).
     * @param cmp the comparison function
     */
    sort(cmp?: (a: M, b: M) => number): this {
        if (arguments.length > 0) {
            this.cmp = cmp;
        }
        if (this.cmp !== undefined) {
            this._mergesort();
            this.sortListeners.forEach(fn => fn());
        }
        return this;
    }

    /**
     * Remove the last item in the array
     * @return the last item in the array
     */
    pop(): M | undefined {
        return this.items.pop();
    }

    /**
     * Insert an item to the end the array, equivalent to .add() when sorted
     * @param item the item to add
     * @return the new length of the array
     */
    push(item: M): number {
        if (this.cmp !== undefined) {
            this.add(item);
        } else {
            this.items.push(item);
        }
        return this.length;
    }
    /**
     * Insert an item to the front of the array, equivalent to .add() when sorted
     * @param item the item to add
     * @return the new length of the array
     */
    unshift(item: M): number {
        if (this.cmp !== undefined) {
            this.add(item);
        } else {
            this.items.unshift(item);
        }
        return this.length;
    }

    /**
     * Combines two or more arrays
     * @param items 
     */
    concat(...items: ConcatArray<M>[]): M[] {
        return this.items.concat(...items);
    }

    /**
     * Join the items in the array with a string joiner
     */
    join(joiner: string): string {
        return this.items.join(joiner);
    }
    
    /**
     * Remove and return the first item in the collection
     */
    shift(): M | undefined {
        return this.items.shift();
    }
    
    /**
     * Return a subsection copy of the collection
     * @param start index to start
     * @param end index to end
     */
    slice(start?: number, end?: number): M[] {
        return this.items.slice(start, end);
    } 

    private _mergesort(): void {
        var dest = this.items;
        var src = Array.from(dest);
        this._mergesortRecurse(0, src, dest, src.length);
    }

    private _mergesortRecurse(low: number, src: M[], dst: M[], hi: number): void {
        if (hi - low < 2) return;
        var mid = low + Math.floor((hi - low) / 2);
        this._mergesortRecurse(low, dst, src, mid);
        this._mergesortRecurse(mid, dst, src, hi);
        var i = low;
        var j = mid;
        for (var k = low; k < hi; ++k) {
            if (i < mid && (j >= hi || this.cmp!(src[i], src[j]) <= 0)) {
                dst[k] = src[i];
                ++i;
            } else {
                dst[k] = src[j];
                ++j;
            }
        }
    }

    reverse(): M[] {
        throw new Error("Not supported");
    }
    
    splice(): M[] {
        throw new Error("Not supported");
    }

    fill(): this {
        throw new Error("Not supported");
    }
    
    copyWithin(): this {
        throw new Error("Not supported");
    }
    
    keys(): IterableIterator<number> {
        throw new Error("Unsupported");
    }
    
    values(): IterableIterator<M> {
        throw new Error("Unsupported");
    }

    [Symbol.unscopables] = Array.prototype[Symbol.unscopables];
}

export function makeSimpleCollection<T>(items: T[], cmp?: (a: T, b: T) => number): SimpleCollection<T> {
    return new SimpleCollection<T>(items, cmp);
};