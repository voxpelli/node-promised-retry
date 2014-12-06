/*jslint node: true */
/* global -Promise */

'use strict';

var _ = require('lodash');
var Promise = require('promise');

var Retry = function (options) {
  options = _.extend({
    name: 'unknown',
    setup: Promise.resolve,
    retryMin: 0,
    retryBase: 1.2,
    retryExponent: 33,
    retryDelay: function (retries) {
      return options.retryMin + Math.floor(
        1000 *
        Math.pow(options.retryBase, Math.min(options.retryExponent, retries)) *
        Math.random()
      );
    },
    log: console.log.bind(console),
  }, options);

  this.options = options;
  this.log = options.log;
  this.failures = 0;
};

Retry.prototype._try = function () {
  var self = this;

  return new Promise(function (resolve, reject) {
    var next = function () {
      self.retrying = undefined;
      self.abort = undefined;
      self.options.try().then(resolve, reject);
    };

    if (self.failures) {
      var delay = self.options.retryDelay(self.failures);
      if (delay !== false) {
        self.log('Retry %d: Waiting %d ms to try %s again', self.failures, delay, self.options.name);
        self.retrying = setTimeout(next, delay);
        self.abort = reject;
      } else {
        reject(new Error('Retries aborted after %d attempts', self.failures));
      }
    } else {
      process.nextTick(next);
    }
  }).catch(function (err) {
    self.log(err, 'Failed retry attempt for ' + self.options.name);

    if (self.stopped) {
      throw err;
    }

    self.failures += 1;
    self.retrying = undefined;
    self.abort = undefined;

    return self._try();
  });
};

Retry.prototype.try = Promise.nodeify(function (createNew) {
  var self = this;

  if (self.promisedResult) {
    return self.promisedResult;
  } else if (createNew === false) {
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

  return self.promisedResult;
});

Retry.prototype.end = function () {
  var self = this;

  this.stopped = true;

  this.try(true).then(function (result) {
    self.promisedResult = undefined;
    self.options.end(result);
  });

  if (this.retrying) {
    clearTimeout(this.retrying);
    this.retrying = undefined;
    this.promisedResult = undefined;
    if (this.abort) {
      this.abort(new Error('Retries of ' + self.options.name + ' ended'));
    }
  }
};

Retry.prototype.reset = function () {
  this.promisedResult = undefined;
  this.failures = 0;
};

module.exports = Retry;
