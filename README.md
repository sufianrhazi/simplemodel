# simplemodel

A tiny, simple, strict, typescript-oriented model and collection API.

It allows for observation of changes to members on models and changes to items within a collection.

* Zero dependencies
* Collection index lookup requires a native ES6 runtime (for Proxy)
* Models act like plain old objects that are observable
* Collections act like plain old arrays that are observable
* Similar interface to Backbone.Model and Backbone.Collection, but designed for the capabilities of ES6
* Library size: 4,309 bytes minified (1,253 bytes gzip-compressed)
* Works well with `tsc --strict`


## Installation

`npm install @srhazi/simplemodel`


## Building

* Note: Minified standalone build depends on [closure-compiler](http://code.google.com/closure/compiler).
* Version `1.0.1` built with
  * typescript version: 2.6.2
  * node version: 4.1.1
  * amdclean version: 2.7.0
  * Closure Compiler version: 20130227 (Built on: 2017/09/14 12:51)

1. `git clone https://github.com/sufianrhazi/simplemodel.git`
2. `cd simplemodel`
3. `npm install`
4. `s/dist`


## Usage

```ts
import { makeModel, makeCollection } from '@srhazi/simplemodel';

interface Point {
  x: number;
  y: number;
}
const position = makeModel<Point>({ x: 10, y: 10 });