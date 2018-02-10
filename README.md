# simplemodel

A tiny and simple model and collection API.

* Models act like plain old objects (that are observable for mutations)
* Collections act like plain old arrays (that are observable for mutations)
* Zero dependencies
* Requires native ES2015 runtime for full feature set (needs `Proxy` for collection length)
* Collections implement a stable sort
* Similar in spirit to Backbone.Model and Backbone.Collection (or `Object.observe`), but designed with ES2015 in mind
* Library size: 5,796 bytes minified (1,611 bytes gzip-compressed)
* Typescript friendly, works well with `tsc --strict`


## Installation

`npm install @srhazi/simplemodel`


## Basic Usage

```typescript
import { Model, makeModel, Collection, makeCollection } from '@sufianrhazi/simplemodel';

interface Pokemon { name: string, type: string, level: number };

const pikachu = makeModel({ name: "pikachu", type: "electric", level: 17});
const squirtle = makeModel({ name: "squirtle", type: "water", level: 10});
const charmander = makeModel({ name: "charmander", type: "fire", level: 15});
const lineup = makeCollection([pikachu, squirtle]);

// models are observable by property name
squirtle.on('name', (newValue, oldValue) => {
    console.log(`squirtle's name changed from ${oldValue} to ${newValue}`);
});

// collections are observable for adds/removes/resets/sorts
lineup.on('add', (item, index) => {
    console.log(`${item.name} added to the group!`)
});
lineup.on('remove', (item, index) => {
    console.log(`${item.name} removed from the group!`)
});

// collections that hold models are also observable for model changes
lineup.on('change', (item, index, field, newValue, oldValue) => {
    console.log(`${item.name}'s ${field} changed from ${oldValue} to ${newValue}!`);
});

// models act just like objects
squirtle.name = squirtle.name + ', the destroyer';
// log: squirtle's name changed from squirtle to squirtle, the destroyer

// collections act just like arrays (though index access is typesafe)
lineup[0]!.level += 1;
// log: pikachu's level changed from 17 to 18!

// collections can be added to
lineup.add(charmander);
// log: charmander added to the group!

// models can be updated atomically
charmander.update({
    level: charmander.level + 1,
    name: "charmeleon"
});
// log: charmander's name changed from charmander to charmeleon!
// log: charmander's level changed from 15 to 16!

// collections can be removed
lineup.remove(lineup[1]!);
// log: squirtle removed from the group!
```

## Building

* Note: Minified standalone build depends on [closure-compiler](http://code.google.com/closure/compiler).
* Version `1.0.0` built with
  * typescript version: 2.6.2
  * node version: 4.1.1
  * amdclean version: 2.7.0
  * Closure Compiler version: 20130227 (Built on: 2017/09/14 12:51)

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

A collection behaves *almost* like arrays that also have observable behavior. Notable exceptions:

* A collection *may* be sorted by providing a comparison function upon creation
  * Sort order is *preserved upon addition*. Items added will be inserted in sort order
  * The comparison function can be set via calling `.sort(fn)`
  * Calling `.sort(undefined)` will *remove* the preserved sort order
  * Calling `.sort()` with no parameters will *re-sort* the collection, which is useful when you know the contained items have mutated.
  * If sorted, inserts are done via binary search, which adds `O(lg(n))` comparisons prior to resizing the underlying array via `.splice()`
* the `.push()`, `.shift()`, or `.splice()` methods do not exist, use `.add()`, `.remove()`, or `.reset()`
* Index lookup is strict: `collection[1]` has the type `T | undefined`

```typescript
// A collection is an array that has some additional behavior
type Collection<T> = ArrayIsh<T> & {
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