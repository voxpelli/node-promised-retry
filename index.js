// @ts-check
/// <reference types="node" />

'use strict';

const noop = () => {};

class RetryError extends Error {
  /**
   * @param {string} message
   * @param {{ aborted?: boolean }} [options]
   */
  constructor (message, { aborted } = {}) {
    super(message);

    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);

    this.aborted = !!aborted;
  }
}

/** @returns {typeof console.log} */
const getDefaultLog = () =>
  // eslint-disable-next-line node/no-process-env
  process.env.NODE_ENV === 'production'
    ? () => {}
    // eslint-disable-next-line no-console
    : console.log.bind(console);

/** @typedef {(failures: number) => number|false} RetryDelayCallback */

/**
 * @param {{ retryMin: number, retryBase: number, retryExponent: number }} options
 * @returns {RetryDelayCallback}
 */
const getDefaultRetryDelay = ({ retryMin, retryBase, retryExponent }) => {
  return (retries) => {
    return retryMin + Math.floor(
      1000 *
      Math.pow(retryBase, Math.min(retryExponent, retries)) *
      Math.random()
    );
  };
};

/**
 * @template T
 * @returns {[Promise<T>, (value: T | PromiseLike<T>) => void, (err: Error) => void]}
 */
const resolveablePromise = () => {
  /** @type {(value: T | PromiseLike<T>) => void} */
  let resolver;
  /** @type {(err: Error) => void} */
  let rejecter;

  const resolveable = new Promise((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });

  // @ts-ignore
  return [resolveable, resolver, rejecter];
};

/**
 * @typedef RetryOptions
 * @property {string} [name="unknown"]
 * @property {function(): void|Promise<void>} [setup]
 * @property {function(): Promise<any>} try
 * @property {function(any): any} success
 * @property {function(any): any} end
 * @property {number} [retryMin=0]
 * @property {number} [retryBase=1.2]
 * @property {number} [retryExponent=33]
 * @property {number} [retryLimit]
 * @property {RetryDelayCallback} [retryDelay]
 * @property {function(string): void} [log]
 */

// TODO: Convert into a type templated function instead, to be able to derive the resolved type
class Retry {
  /** @param {RetryOptions} options */
  constructor (options) {
    const {
      log = getDefaultLog(),
      name = 'unknown',
      retryMin = 0,
      retryBase = 1.2,
      retryExponent = 33,
      retryDelay,
      ...optionalOptions
    } = options;

    const resolvedOptions = {
      name,
      retryMin,
      retryBase,
      retryExponent,
      retryDelay: retryDelay || getDefaultRetryDelay({ retryMin, retryBase, retryExponent }),
      ...optionalOptions,
    };

    if (!resolvedOptions.try || !resolvedOptions.success || !resolvedOptions.end) {
      throw new Error('Promised Retry needs to be provided a "try", "success" and "end" function');
    }

    /** @protected */
    this.options = resolvedOptions;
    /** @protected */
    this.log = log;
    /** @protected */
    this.failures = 0;
    /** @protected */
    this.retrying = undefined;
    /** @protected */
    this.abort = undefined;
    /** @protected */
    this.promisedResult = undefined;
  }

  /**
   * @protected
   * @param {any} err
   * @returns {Promise<any>}
   */
  async _maybeRetry (err = new Error('Unknown error')) {
    this.log(`Failed retry attempt for ${this.options.name}: ${err.stack}`);

    // If we're stopped or aborted, then we should not give it a new attempt
    if (this.stopped || err.aborted) {
      throw err;
    }

    this.failures += 1;
    this.retrying = undefined;
    this.abort = undefined;

    // If we have reached a retry limit, then we should not give it a new attempt
    if (this.options.retryLimit !== undefined && this.failures > this.options.retryLimit) {
      throw new Error('Retry limit reached');
    }

    // TODO: Why this instead of Promise.resolve().then(() => this._try()) ?
    // Otherwise: Try again!
    return new Promise(resolve => {
      process.nextTick(() => {
        resolve(this._try());
      });
    });
  }

  /**
   * @protected
   * @returns {Promise<any>}
   */
  async _throttledAttempt () {
    const [result, resolve, reject] = resolveablePromise();

    // eslint-disable-next-line promise/prefer-await-to-then
    const next = () => resolve(Promise.resolve().then(async () => {
      this.retrying = undefined;
      this.abort = undefined;
      if (this.stopped) {
        throw new Error(this.options.name + ' has been stopped');
      }
      return this.options.try();
    }));

    if (this.failures) {
      const delay = this.options.retryDelay(this.failures);
      if (delay !== false) {
        this.log(`Retry ${this.failures}: Waiting ${delay} ms to try ${this.options.name} again`);
        this.retrying = setTimeout(next, delay);
        this.abort = reject;
      } else {
        throw new RetryError('Retries aborted after ' + this.failures + ' attempts', { aborted: true });
      }
    } else {
      process.nextTick(next);
    }

    return result;
  }

  /**
   * @protected
   * @returns {Promise<any>}
   */
  async _try () {
    try {
      // We use await here to ensure that we can catch any errors and retry rather than forward errors
      const resolvedValue = await this._throttledAttempt();

      this.failures = 0;

      return resolvedValue;
    } catch (err) {
      return this._maybeRetry(err);
    }
  }

  /**
   * @protected
   * @returns {Promise<any>}
   */
  async _createTryPromise () {
    if (this.options.setup) await this.options.setup();

    const result = await this._try();

    this.log(`Successful retry attempt for ${this.options.name}`);

    return this.options.success(result) || result;
  }

  // TODO: Improve return type!
  /**
   * @param {boolean} [createNew]
   * @returns {Promise<*>}
   */
  async try (createNew = true) {
    if (!this.promisedResult) {
      if (createNew === false || this.stopped) {
        throw new Error('No available instance');
      }
      this.promisedResult = this._createTryPromise();
    }

    return this.promisedResult;
  }

  async end () {
    this.stopped = true;

    if (this.retrying) {
      clearTimeout(this.retrying);
      this.retrying = undefined;
      this.promisedResult = undefined;
      if (this.abort) {
        this.abort(new Error('Retries of ' + this.options.name + ' ended'));
      }
    }

    const result = await this.try(false).catch(noop);

    this.promisedResult = undefined;

    return this.options.end(result);
  }

  reset () {
    this.promisedResult = undefined;
    this.failures = 0;
  }
}

module.exports = Retry;
