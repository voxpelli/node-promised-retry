# Promised Retry

A generic promised based retry mechanism. Useful for eg. ensuring an available database or message queue connection

[![Build Status](https://travis-ci.org/voxpelli/node-promised-retry.svg?branch=master)](https://travis-ci.org/voxpelli/node-promised-retry)
[![Coverage Status](https://coveralls.io/repos/voxpelli/node-promised-retry/badge.svg)](https://coveralls.io/r/voxpelli/node-promised-retry)
[![dependencies Status](https://david-dm.org/voxpelli/node-promised-retry/status.svg)](https://david-dm.org/voxpelli/node-promised-retry)
[![Known Vulnerabilities](https://snyk.io/test/github/voxpelli/node-promised-retry/badge.svg?targetFile=package.json)](https://snyk.io/test/github/voxpelli/node-promised-retry?targetFile=package.json)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat)](https://github.com/Flet/semistandard)

## Installation

```bash
npm install promised-retry --save
```

## Usage

Simple:

```javascript
var retryInstance = new Retry({
  try: function () {
    var db = new pg.Client(require('../config').db);
    db.on('error', function () {
      retryInstance.reset();
      if (channels.length) {
        retryInstance.try();
      }
    });
    return new Promise(function (resolve, reject) {
      db.connect(function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    });
  },
  success: function (db) {
    db.on('notification', self.processNotification.bind(self));

    channels.forEach(function (channel) {
      db.query('LISTEN ' + channel);
    });
  },
  end: function (db) {
    db.end();
  },
});
```

## Syntax

`var retryInstance = new Retry(options);`

## Options

* **try** - the function that will make up the attempt. Should return a Promise that's fulfilled or rejected depending on whether the attempt is a success or failure.
* **success** - a function that's run on an successful attempt. Will be sent the result of the attempt and can return a modified result or a Promise.
* **end** - a function that will be run on the closing of the retry script. Useful for when needing to fix a graceful shutdown of eg. a database. Can return a Promise if it needs to do something that the shutdown needs to wait for.
* **name** – the name of the Retry attempt. Used in eg debugging.
* **setup** – a function that will be run before the first attempt
* **name** – the name of the Retry attempt. Used in eg debugging.
* **retryMin** – minimum delay in milliseconds before a retry. Defaults to `0`.
* **retryBase** – the base of the delay exponent. Defaults to `1.2`.
* **retryExponent** – the maximum exponent of the delay exponent. If retries are higher than `retryExponent`, `retryExponent` will be used rather than the retry number. Defaults to `33` which means on average max delay of 3m 25s.
* **retryDelay** – a function used to calculate the delay. Replaces the default exponent calculation. If it returns `false` the retries will be aborted.
* **retryLimit** – maximum amount of retries. Defaults to unlimited retries.
* **log** – a logger function. Defaults to `console.log()`.

## Methods

* **try** – returns a Promise that will be resolved with the successful attempt or rejected if the retries were aborted due to the result of `options.retryDelay()` or because the retry instance was ended.
* **end** – ends the Retry mechanism completely. Useful for ensuring a graceful shutdown. Returns a Promise that will be resolved when done.
* **reset** – resets the Retry mechanism. Used in response to an event that eg. indicated that the connection the Retry mechanism managed to established has errored out. Will not result in a retry automatically. That has to be done manually if one wants one right away.

## Lint / Test

`npm test` or to watch, install `grunt-cli` then do `grunt watch`
