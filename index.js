'use strict';

const assert = require('assert');

const noop = () => {};

const Retry = function (options) {
  const resolvedOptions = Object.assign({
    name: 'unknown',
    setup: () => Promise.resolve(),
    try: undefined,
    success: undefined,
    end: undefined,
    retryMin: 0,
    retryBase: 1.2,
    retryExponent: 33,
    retryLimit: undefined,
    retryDelay: retries => {
      return resolvedOptions.retryMin + Math.floor(
        1000 *
        Math.pow(resolvedOptions.retryBase, Math.min(resolvedOptions.retryExponent, retries)) *
        Math.random()
      );
    },
    log: console.log.bind(console)
  }, options);

  assert(resolvedOptions.try && resolvedOptions.success && resolvedOptions.end, 'Promised-retry needs to be provided a "try", "success" and "end" function');

  this.options = resolvedOptions;
  this.log = resolvedOptions.log;
  this.failures = 0;
};

Retry.prototype._try = function () {
  return new Promise((resolve, reject) => {
    const next = () => {
      this.retrying = undefined;
      this.abort = undefined;
      if (this.stopped) { return reject(new Error(this.options.name + ' has been stopped')); }
      this.options.try().then(resolve, reject);
    };

    if (this.failures) {
      const delay = this.options.retryDelay(this.failures);
      if (delay !== false) {
        this.log('Retry %d: Waiting %d ms to try %s again', this.failures, delay, this.options.name);
        this.retrying = setTimeout(next, delay);
        this.abort = reject;
      } else {
        let aborted = new Error('Retries aborted after ' + this.failures + ' attempts');
        aborted.aborted = true;
        reject(aborted);
      }
    } else {
      process.nextTick(next);
    }
  }).catch(err => {
    this.log(err, 'Failed retry attempt for ' + this.options.name);

    if (this.stopped || err.aborted) {
      throw err;
    }

    this.failures += 1;
    this.retrying = undefined;
    this.abort = undefined;

    if (this.options.retryLimit !== undefined && this.failures > this.options.retryLimit) {
      throw new Error('Retry limit reached');
    }

    return new Promise(resolve => {
      process.nextTick(() => {
        resolve(this._try());
      });
    });
  });
};

Retry.prototype.try = function (createNew) {
  if (this.promisedResult) {
    return this.promisedResult;
  } else if (createNew === false || this.stopped) {
    return Promise.reject(new Error('No available instance'));
  }

  this.promisedResult = Promise.resolve()
    .then(() => this.options.setup())
    .then(() => this._try())
    .then(result => {
      this.log('Successful retry attempt for %s', this.options.name);
      this.failures = 0;
      return this.options.success(result) || result;
    });

  return this.promisedResult;
};

Retry.prototype.end = function () {
  this.stopped = true;

  const result = this.try(false).catch(noop).then(result => {
    this.promisedResult = undefined;
    return this.options.end(result);
  });

  if (this.retrying) {
    clearTimeout(this.retrying);
    this.retrying = undefined;
    this.promisedResult = undefined;
    if (this.abort) {
      this.abort(new Error('Retries of ' + this.options.name + ' ended'));
    }
  }

  return result;
};

Retry.prototype.reset = function () {
  this.promisedResult = undefined;
  this.failures = 0;
};

module.exports = Retry;
