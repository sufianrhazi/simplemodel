# simplemodel

A tiny and simple model and collection API.

* Models act like plain old objects (that are observable for mutations)
* Collections act like plain old arrays (that are observable for mutations)
* Zero dependencies
* Requires native ES2015 runtime for full feature set (needs `Proxy` for collection length)
* Collections implement a stable sort
* Similar in spirit to Backbone.Model and Backbone.Collection (or `Object.observe`), but designed with ES2015 in mind
* v4.0.0 Library size: 11,909 bytes minified (2,251 bytes gzip-compressed)
* Typescript friendly, works well with `tsc --strict`


## Installation

`npm install @srhazi/simplemodel`


## Basic Usage

```typescript
import { Model, makeModel, Collection, makeModelCollection } from '@sufianrhazi/simplemodel';

interface Pokemon { name: string, type: string, level: number };

const pikachu = makeModel({ name: "pikachu", type: "electric", level: 17});
const squirtle = makeModel({ name: "squirtle", type: "water", level: 10});
const charmander = makeModel({ name: "charmander", type: "fire", level: 15});
const lineup = makeModelCollection([pikachu, squirtle]);

// -> models are observable by property name
squirtle.on('name', (newValue, oldValue) => {
    console.log(`squirtle's name changed from <${oldValue}> to <${newValue}>`);
});

// * Collections are observable for adds/removes/resets/sorts
lineup.on('add', (item, index) => {
    console.log(`${item.name} added to the group at index ${index}!`);
});
lineup.on('remove', (item, index) => {
    console.log(`${item.name} removed from the group! (was index ${index})`);
});

// * Collections that hold Models are also observable for model changes
lineup.on('change', (item, index, field, newValue, oldValue) => {
    console.log(`${item.name} (pokemon ${index}) ${field} changed from <${oldValue}> to <${newValue}>!`);
});

// * Models act just like objects
squirtle.name = squirtle.name + ', the destroyer';
// "squirtle's name changed from <squirtle> to <squirtle, the destroyer>"
// "squirtle, the destroyer (pokemon 1) name changed from <squirtle> to <squirtle, the destroyer>"
// * Why two logs? There's a 'name' handler on the model and 'change' handler on the collection.

// * Collections act just like arrays (though index access is typesafe)
lineup[0]!.level += 1;
// "pikachu (pokemon 0) level changed from <17> to <18>!"

// collections can be added to
lineup.add(charmander);
// log: charmander added to the group at index 2!

// models can be updated atomically
charmander.update({
    level: charmander.level + 1,
    name: "charmeleon"
});
// log: charmeleon's level changed from <15> to <16>!
// log: charmeleon's name changed from <charmander> to <charmeleon>!

// collections can be removed
lineup.remove(lineup[1]!);
// log: squirtle, the destroyer removed from the group! (was index 0)
```

## Building

* Note: Minified standalone build depends on [closure-compiler](http://code.google.com/closure/compiler).
* Version `4.0.0` built with
  * typescript version: 4.0.2
  * node version: v12.16.2
  * amdclean version: 2.7.0
  * Closure Compiler version: v20200517 (Built on: 2020-05-18 22:36)
* Note: Version `4.0.0` compatible with TypeScript version 3.0.3+
* Note: Version `3.0.1` has tests which rely on TypeScript 2.8 features (conditional types). The library *should* build
  fine in earlier versions (back to at least 2.6), but tests will not build.

1. `git clone https://github.com/sufianrhazi/simplemodel.git`
2. `cd simplemodel`
3. `npm install`
4. `s/dist`


## Reference API

### Model

```typescript
// A model is an object that has some additional behavior 
type Model<T> = T & ModelBehavior<T>;

interface ModelBehavior<T> {
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
```

### Collection

A collection behaves *almost* like arrays that also have observable behavior. There are two types of collections:

1. `makeSimpleCollection<T>(items: T[], cmp: (a: T, b: T) => number): SimpleCollection<T>` - observable (and sorted) list of any type of objects
2. `makeModelCollection<T>(items: Model<T>[], cmp: (a: T, b: T) => number): ModelCollection<T>` - observable (and sorted) list of model objects

In addition to `add`, `remove`, and `reset` events, `ModelCollection<T>` objects also emit `change` events when a particular model within it changes.

There are a few quirks to collections:

* A collection *may* be sorted by providing a comparison function upon creation
  * Sort order is *preserved* upon addition. Newly added items will be inserted in sort order
  * If items are mutated, sort order is *not preserved*, you must call `.sort()` to *re-sort* the collection.
  * The comparison function can be set and cleared via calling `.sort(fn)` / `.sort(undefined)`
  * If sorted, inserts are performed via binary search, which adds `O(lg(n))` comparisons in addition to the overhead of resizing the underying array via `.splice()`

The following methods typical in arrays are *not* implemented:
* `.copyWithin()`
* `.fill()`
* `.keys()`
* `.reverse()`
* `.splice()`
* `.values()`

```typescript
// A collection is an array that has some additional behavior
type ModelCollection<T> = ArrayIsh<T> & {
    /**
     * Listen for items added to this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'add', handler: (item: T, index: number) => void): () => void;

    /**
     * Listen for items removed from this collection
     * @returns a function that removes the listener when called
     */
    on(name: 'remove', handler: (item: T, index: number) => void): () => void;

    /**
     * Listen for a complete replacement of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'reset', handler: () => void)): () => void;

    /**
     * Listen for a complete sort of items in collection
     * @returns a function that removes the listener when called
     */
    on(name: 'sort', handler: () => void)): () => void;

    /**
     * If the collection contains Model instances, listen for changes to any
     * of the Models in the collection.
     * @returns a function that removes the listener when called
     */
    on(name: 'change', handler: (item: T, index: number, field: keyof T, curr: T[typeof field], prev: T[typeof field]) => void): () => void;

    /**
     * Listen for any change to the set of items in this collection
     * @returns a function that removes the listener when called
     */
    onAny(handler: () => void)): () => void;

    /**
     * Remove all listeners
     */
    offAll(): void;

    /**
     * Add a Model to the collection.
     * If sorted, the item will be placed at the correctly sorted index.
     */
    add(item: T): void;

    /**
     * Remove an item from the collection
     * @returns true if an item was removed
     */
    remove(item: T): boolean;

    /**
     * Remove an item at a specific index
     * @param index the index to remove
     * @returns true if an item is removed
     */
    removeAt(index: number): boolean;

    /**
     * Replace all items in the collection
     * @param newItems the replacement items
     */
    reset(newItems: T[]): void;
}
