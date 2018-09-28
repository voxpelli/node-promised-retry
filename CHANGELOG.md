# Changelog

## 0.3.0 (2018-09-28)

* **Breaking change:** Now targets at least Node.js 8.x
* **Breaking change:** No longer supports a callback on `try()`
* **Breaking change:** No longer throws `AssertionError` on invalid configuration when created

## 0.2.3 (2015-08-20)


### Bug Fixes

* **main:** stopped retrying doesn't mean ending ([7c78b25d](http://github.com/voxpelli/node-promised-retry/commit/7c78b25d5f84dde2e1dfe8e434430d92fd10152e))


### Features

* **main:**
  * allow retries to be limited ([11c5c607](http://github.com/voxpelli/node-promised-retry/commit/11c5c607b5a1c35fd17334b79e122e586b5d03fa))
  * allow retries to be limited ([7bb985c0](http://github.com/voxpelli/node-promised-retry/commit/7bb985c013caceef40216dd809caa225a7900506))


## 0.2.2 (2015-08-05)


### Bug Fixes

* **main:** default retry delay wasn't working ([4f66c045](http://github.com/voxpelli/node-promised-retry/commit/4f66c04568ad1ad73cdfd3630337990a8619e97d))


## 0.2.1 (2015-08-05)


### Bug Fixes

* **main:**
  * if not started, when ending, do nothing ([8be97b23](http://github.com/voxpelli/node-promised-retry/commit/8be97b2373d356a9c2d82638be4f470f4daa432a))
  * more tests + fixed some bugs found ([3883e5ac](http://github.com/voxpelli/node-promised-retry/commit/3883e5ac6c65ad17e807549e6873d62e8613b20a))


## 0.2.0 (2015-08-04)


### Bug Fixes

* **dependencies:**
  * no longer polyfilling Promises ([32349434](http://github.com/voxpelli/node-promised-retry/commit/32349434a01afda660c386e9e5301e4a135d80c1))
  * updated some outdated ones ([395ed70c](http://github.com/voxpelli/node-promised-retry/commit/395ed70cf317c19767f42702c134231ff1246221))
* **main:**
  * added compatibility with newer engines ([c12cdeae](http://github.com/voxpelli/node-promised-retry/commit/c12cdeae2715f9eb184a67c96fff332188d88f3e))
  * documented needed options methods ([02fb5401](http://github.com/voxpelli/node-promised-retry/commit/02fb5401ec6a4998a1b0899b79bb97b9bb5a472f))


### Breaking Changes

* Now requiring iojs or at least node 0.12
 ([32349434](http://github.com/voxpelli/node-promised-retry/commit/32349434a01afda660c386e9e5301e4a135d80c1))

