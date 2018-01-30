export type ModelChangeHandler<T, K extends keyof T> = (curr: T[K], prev: T[K]) => void;
export type ModelAnyChangeHandler<T> = <K extends keyof T>(key: K, curr: T[typeof key], prev: T[typeof key]) => void;

export interface ModelBehavior<T> {
    on<K extends keyof T>(key: keyof T, fn: ModelChangeHandler<T, K>): () => void;
    onAny(fn: ModelAnyChangeHandler<T>): () => void;
    offAll(): void;
    update(subset: Partial<T>): void;
}

export type Model<T> = ModelBehavior<T> & {
    [P in keyof T]: T[P];
};

/**
 * Returns an object that one can observe member reference changes
 * performed via property assigment
 *
 * @param val The initial value of a model object
 */
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

    get length(): number {
        return this.items.length;
    }

    [index: number]: T | undefined;

    on(name: 'add', handler: CollectionItemListener<T>): () => void;
    on(name: 'remove', handler: CollectionItemListener<T>): () => void;
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

    onAny(handler: CollectionResetListener<T>): () => void {
        this.anyListeners.push(handler);
        return () => {
            this.anyListeners = this.anyListeners.filter(f => f !== handler);
        };
    }

    offAll(): void {
        this.addListeners = [];
        this.removeListeners = [];
        this.resetListeners = [];
        this.anyListeners = [];
    }

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

    removeAt(index: number): boolean {
        var item = this.items[index];
        if (item !== undefined) {
            this.items.splice(index, 1);
            this.removeListeners.forEach(fn => fn(item, index));
            this.anyListeners.forEach(fn => fn());
            return true;
        }
        return false;
    }

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

    get entries() {
        return this.items.entries();
    }

    every(fn: (val: T, index: number) => boolean): boolean {
        return this.items.every(fn);
    }

    forEach(fn: (item: T, index: number, arr: T[]) => void): void {
        this.items.forEach(fn);
    }

    find(fn: (item: T, index: number, arr: T[]) => boolean): T | undefined {
        return this.items.find(fn);
    }

    findIndex(fn: (item: T, index: number, arr: T[]) => boolean): number {
        return this.items.findIndex(fn);
    }

    includes(val: T): boolean {
        return this.items.includes(val);
    }

    indexOf(val: T): number {
        return this.items.indexOf(val);
    }

    map<V>(fn: (val: T, index: number) => V): V[] {
        return this.items.map(fn);
    }

    filter(fn: (val: T, index: number) => boolean): T[] {
        return this.items.filter(fn);
    }

    reduce<V>(fn: (acc: V, curr: T, index: number) => V, acc: V): V {
        return this.items.reduce(fn, acc);
    }

    reduceRight<V>(fn: (acc: V, curr: T, index: number) => V, acc: V): V {
        return this.items.reduceRight(fn, acc);
    }

    some(fn: (val: T, index: number) => boolean): boolean {
        return this.items.some(fn);
    }
}