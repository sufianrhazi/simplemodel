/// <reference path="../node_modules/@types/jasmine/index.d.ts" />

import { assert } from "chai";
import { makeModel, makeCollection } from './simplemodel';

describe('model', () => {
    it('acts like an object', () => {
        const m = makeModel({
            x: 'hello',
            y: 3,
            z: {
                foo: 'bar'
            }
        });
        assert.strictEqual('hello', m.x);
        assert.strictEqual(3, m.y);
        assert.strictEqual('bar', m.z.foo);
        m.x = 'hi';
        m.y = 5;
        m.z = {
            foo: 'baz'
        };
        assert.strictEqual('hi', m.x);
        assert.strictEqual(5, m.y);
        assert.strictEqual('baz', m.z.foo);
    });

    it('has enumerable properties like an object', () => {
        const m = makeModel({
            foo: 1,
            bar: 2,
            baz: 3
        });
        assert.sameMembers(['foo', 'bar', 'baz'], Object.keys(m));
    });

    it('allows for a single key to be observed', () => {
        const m = makeModel({
            watched: 1,
            notWatched: 'nope',
        });
        const calls: {prev: number, curr: number}[] = [];
        let numUpdates = 0;
        
        m.on<'watched'>('watched', (curr, prev) => {
            calls.push({curr, prev});
        });
        m.on<'watched'>('watched', () => {
            numUpdates += 1;
        });

        m.watched = 2;
        m.update({
            watched: 3,
            notWatched: 'whatever'
        });
        m.notWatched = 'never';
        m.watched = 4;

        assert.deepEqual([
            {prev: 1, curr: 2},
            {prev: 2, curr: 3},
            {prev: 3, curr: 4},
        ], calls);
        assert.strictEqual(3, numUpdates);
    });

    it('allows for single key observers to be disabled', () => {
        const m = makeModel({
            watched: 1,
            notWatched: 'nope',
        });
        let numUpdates = 0;
        
        let off = m.on<'watched'>('watched', () => {
            numUpdates += 1;
        });

        m.watched = 2;
        m.watched = 3;
        off();
        m.watched = 4;
        m.watched = 5;

        assert.strictEqual(2, numUpdates);
    });

    it('allows for any key to be observed', () => {
        const m = makeModel({
            a: 1,
            b: 'one',
        });
        let numUpdates = 0;
        let values: {
            key: 'a' | 'b',
            prev: number | string,
            curr: number | string,
        }[] = [];
        
        let offValues = m.onAny((key, curr, prev) => {
            values.push({key, prev, curr});
        });
        let offCount = m.onAny(() => {
            numUpdates += 1;
        });

        m.a = 2;
        m.b = 'two';
        m.update({
            a: 3,
            b: 'three'
        });
        offValues();
        m.update({
            a: 4,
            b: 'four'
        });
        offCount();
        m.a = 5;
        m.b = 'five';

        assert.deepEqual<{
            key: 'a' | 'b',
            prev: number | string,
            curr: number | string,
        }[]>([
            {key: 'a', prev: 1, curr: 2},
            {key: 'b', prev: 'one', curr: 'two'},
            {key: 'a', prev: 2, curr: 3},
            {key: 'b', prev: 'two', curr: 'three'}
        ], values);
        assert.strictEqual(6, numUpdates);
    });

    it('allows for all observers to be removed', () => {
        const m = makeModel({
            a: 1,
            b: 'one',
        });
        let numUpdates = 0;
        let values: {
            key: 'a' | 'b',
            prev: number | string,
            curr: number | string,
        }[] = [];
        
        let offValues = m.onAny((key, curr, prev) => {
            values.push({key, prev, curr});
        });
        let offCount = m.on('a', () => {
            numUpdates += 1;
        });

        m.offAll();

        m.a = 2;
        m.b = 'two';

        assert.deepEqual([], values);
        assert.strictEqual(0, numUpdates);
    });
});

describe('collection', () => {
    it('acts like an array', () => {
        const c = makeCollection([0,1,2,3,4,5]);
        assert.strictEqual(0, c[0]);
        assert.strictEqual(3, c[3]);
        assert.strictEqual(5, c[5]);
        assert.strictEqual(6, c.length);
        assert.isUndefined(c[6]);
    });
    it('can be iterated over', () => {
        const c = makeCollection([1,3,5]);
        let acc = 0;
        for (let i of c) {
            acc += i;
        }
        assert.strictEqual(9, acc);
    });
    it('may be automatically sorted', () => {
        const c = makeCollection([1,3,2,4,0], (a, b) => a - b);
        assert.deepEqual([0,1,2,3,4], Array.from(c));
        c.add(2.5);
        assert.deepEqual([0,1,2,2.5,3,4], Array.from(c));
        c.remove(1);
        assert.deepEqual([0,2,2.5,3,4], Array.from(c));
    });
    it('can be observed for adds', () => {
        const c = makeCollection<number>([]);
        const observed: {item: number, index: number}[] = [];
        const off = c.on('add', (item, index) => {
            observed.push({item, index});
        });
        c.add(1);
        c.add(3);
        c.add(2);
        c.add(4);
        off();
        c.add(5);
        assert.deepEqual([
            {item: 1, index: 0},
            {item: 3, index: 1},
            {item: 2, index: 2},
            {item: 4, index: 3},
        ], observed);
    });
    it('can be observed for adds when sorted', () => {
        const c = makeCollection<number>([], (a, b) => a - b);
        const observed: {item: number, index: number}[] = [];
        const off = c.on('add', (item, index) => {
            observed.push({item, index});
        });
        c.add(1);
        c.add(3);
        c.add(2);
        c.add(4);
        off();
        c.add(5);
        assert.deepEqual([
            {item: 1, index: 0},
            {item: 3, index: 1},
            {item: 2, index: 1},
            {item: 4, index: 3},
        ], observed);
    });
    it('can be observed for removes', () => {
        const c = makeCollection(['foo', 'bar', 'baz']);
        const observed: {item: string, index: number}[] = [];
        const off = c.on('remove', (item, index) => {
            observed.push({item, index});
        });
        c.remove('foo');
        c.remove('baz');
        c.remove('bum');
        off();
        c.remove('bar');
        assert.deepEqual([
            {item: 'foo', index: 0},
            {item: 'baz', index: 1},
        ], observed);
    });
    it('can be observed for removes when sorted', () => {
        const c = makeCollection(['foo', 'bar', 'baz'], (a, b) => a.localeCompare(b));
        const observed: {item: string, index: number}[] = [];
        const off = c.on('remove', (item, index) => {
            observed.push({item, index});
        });
        c.remove('foo');
        c.remove('baz');
        c.remove('bum');
        off();
        c.remove('bar');
        assert.deepEqual([
            {item: 'foo', index: 2},
            {item: 'baz', index: 1},
        ], observed);
    });
    it('can be observed for resets', () => {
        const c = makeCollection(['foo', 'bar', 'baz']);
        let numResets = 0;
        const off = c.on('reset', () => {
            numResets++;
        });
        c.reset(['a', 'b', 'c']);
        c.reset(['b', 'b', 'c']);
        c.reset(['c', 'b', 'c']);
        off();
        c.reset(['d', 'b', 'c']);
        assert.strictEqual(3, numResets);
    });
    it('can be observed for any changes', () => {
        const c = makeCollection(['foo', 'bar', 'baz']);
        let numChanges = 0;
        const off = c.onAny(() => {
            numChanges++;
        });
        c.reset(['a', 'b', 'c']);
        c.add('d')
        c.remove('b');
        off();
        c.reset(['d', 'b', 'c']);
        assert.strictEqual(3, numChanges);
    });
});