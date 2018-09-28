// @ts-check
/// <reference types="node" />

'use strict';

const noop = () => {};

class RetryError extends Error {
  /**
   * @param {string} message
   * @param {Object} options
   * @param {boolean} [options.aborted]
   */
  constructor (message, { aborted } = {}) {
    super(message);

    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);

    this.aborted = !!aborted;
  }
}

/**
 * @typedef {object} RetryOptions
 * @property {string} [name="unknown"]
 * @property {function(): void|Promise<void>} [setup]
 * @property {function(): Promise<any>} try
 * @property {function(any): any} success
 * @property {function(any): any} end
 * @property {number} [retryMin=0]
 * @property {number} [retryBase=1.2]
 * @property {number} [retryExponent=33]
 * @property {number} [retryLimit]
 * @property {function(number): number|false} [retryDelay]
 * @property {function(string): void} [log]
 */

class Retry {
  /**
   * @param {RetryOptions} options
   */
  constructor (options) {
    /**
     * @type {RetryOptions}
     */
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

    if (!resolvedOptions.try || !resolvedOptions.success || !resolvedOptions.end) {
      throw new Error('Promised Retry needs to be provided a "try", "success" and "end" function');
    }

    this.options = resolvedOptions;
    this.log = resolvedOptions.log;
    this.failures = 0;
  }
  _try () {
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
          this.log(`Retry ${this.failures}: Waiting ${delay} ms to try ${this.options.name} again`);
          this.retrying = setTimeout(next, delay);
          this.abort = reject;
        } else {
          reject(new RetryError('Retries aborted after ' + this.failures + ' attempts', { aborted: true }));
        }
      } else {
        process.nextTick(next);
      }
    }).catch(err => {
      this.log(`Failed retry attempt for ${this.options.name}: ${err.stack}`);

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
  }

  try (createNew) {
    if (this.promisedResult) {
      return this.promisedResult;
    } else if (createNew === false || this.stopped) {
      return Promise.reject(new Error('No available instance'));
    }

    this.promisedResult = Promise.resolve()
      .then(() => this.options.setup())
      .then(() => this._try())
      .then(result => {
        this.log(`Successful retry attempt for ${this.options.name}`);
        this.failures = 0;
        return this.options.success(result) || result;
      });

    return this.promisedResult;
  }

  end () {
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
  }

  reset () {
    this.promisedResult = undefined;
    this.failures = 0;
  }
}

module.exports = Retry;
