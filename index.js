/*jslint node: true */

'use strict';

var assert = require('assert');

var noop = function () {};

var Retry = function (options) {
  var resolvedOptions = {
    name: 'unknown',
    setup: function () {
      return Promise.resolve();
    },
    try: undefined,
    success: undefined,
    end: undefined,
    retryMin: 0,
    retryBase: 1.2,
    retryExponent: 33,
    retryLimit: undefined,
    retryDelay: function (retries) {
      return resolvedOptions.retryMin + Math.floor(
        1000 *
        Math.pow(resolvedOptions.retryBase, Math.min(resolvedOptions.retryExponent, retries)) *
        Math.random()
      );
    },
    log: console.log.bind(console),
  };

  for (var key in options) {
    resolvedOptions[key] = options[key];
  }

  assert(resolvedOptions.try && resolvedOptions.success && resolvedOptions.end, 'Promised-retry needs to be provided a "try", "success" and "end" function');

  this.options = resolvedOptions;
  this.log = resolvedOptions.log;
  this.failures = 0;
};

Retry.prototype._try = function () {
  var self = this;

  return new Promise(function (resolve, reject) {
    var next = function () {
      self.retrying = undefined;
      self.abort = undefined;
      if (self.stopped) { return reject(new Error(self.options.name + ' has been stopped')); }
      self.options.try().then(resolve, reject);
    };

    if (self.failures) {
      var delay = self.options.retryDelay(self.failures);
      var aborted;
      if (delay !== false) {
        self.log('Retry %d: Waiting %d ms to try %s again', self.failures, delay, self.options.name);
        self.retrying = setTimeout(next, delay);
        self.abort = reject;
      } else {
        aborted = new Error('Retries aborted after ' + self.failures + ' attempts');
        aborted.aborted = true;
        reject(aborted);
      }
    } else {
      process.nextTick(next);
    }
  }).catch(function (err) {
    self.log(err, 'Failed retry attempt for ' + self.options.name);

    if (self.stopped || err.aborted) {
      throw err;
    }

    self.failures += 1;
    self.retrying = undefined;
    self.abort = undefined;

    if (self.options.retryLimit !== undefined && self.failures > self.options.retryLimit) {
      throw new Error('Retry limit reached');
    }

    return self._try();
  });
};

Retry.prototype.try = function (createNew, callback) {
  var self = this;

  if (typeof createNew === 'function') {
    callback = createNew;
    createNew = undefined;
  }

  if (self.promisedResult) {
    return self.promisedResult;
  } else if (createNew === false || this.stopped) {
    return Promise.reject(new Error('No available instance'));
  }

  self.promisedResult = Promise.resolve().then(function () {
      return self.options.setup();
    })
    .then(self._try.bind(self))
    .then(function (result) {
      self.log('Successful retry attempt for %s', self.options.name);
      self.failures = 0;
      return self.options.success(result) || result;
    });

  if (!callback) { return self.promisedResult; }

  self.promisedResult
    .then(function (result) {
      callback(undefined, result);
    })
    .catch(callback);
};

Retry.prototype.end = function () {
  var self = this;

  this.stopped = true;

  var result = this.try(false).catch(noop).then(function (result) {
    self.promisedResult = undefined;
    return self.options.end(result);
  });

  if (this.retrying) {
    clearTimeout(this.retrying);
    this.retrying = undefined;
    this.promisedResult = undefined;
    if (this.abort) {
      this.abort(new Error('Retries of ' + self.options.name + ' ended'));
    }
  }

  return result;
};

Retry.prototype.reset = function () {
  this.promisedResult = undefined;
  this.failures = 0;
};

module.exports = Retry;
