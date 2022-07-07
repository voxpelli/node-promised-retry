# Promised Retry

A generic promised based retry mechanism. Useful for eg. ensuring an available database or message queue connection

[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg)](https://github.com/voxpelli/eslint-config)
[![Types in JS](https://img.shields.io/badge/types_in_js-yes-brightgreen)](https://github.com/voxpelli/types-in-js)
## Installation

```bash
npm install promised-retry
```

## Usage

Simple:

```javascript
const Retry = require('promised-retry')
const { Client } = require('pg')

const retryInstance = new Retry({
  try: async () => {
    const db = new Client(require('../config').db);

    db.on('error', () => {
      retryInstance.reset();
      if (channels.length) {
        retryInstance.try();
      }
    });

    await db.connect();
  },
  success: db => {
    db.on('notification', self.processNotification.bind(self));

    channels.forEach(channel => {
      db.query('LISTEN ' + channel);
    });
  },
  end: db => { db.end(); }
});
```

## Syntax

`const retryInstance = new Retry(options);`

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
