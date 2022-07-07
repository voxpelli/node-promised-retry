/* eslint-env mocha */
/* eslint-disable no-unused-expressions, promise/always-return, promise/prefer-await-to-then */

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const should = chai.should();
chai.use(sinonChai);

const Retry = require('..');

const resolved = Promise.resolve();

describe('Retry', () => {
  /** @type {import('sinon').SinonFakeTimers|undefined} */
  let clock;

  /**
   * @template T
   * @param {() => T} condition
   * @param {number} [count]
   * @returns {Promise<T>}
   */
  const repeatUntilCondition = function (condition, count) {
    return new Promise((resolve, reject) => {
      if (count && count > 100) { return reject(new Error('repeatUntilCondition repeated for too long')); }

      const callback = () => {
        resolve(condition() || repeatUntilCondition(condition, count ? count + 1 : 1));
      };
      process.nextTick(() => {
        if (clock) {
          // eslint-disable-next-line promise/catch-or-return, promise/no-callback-in-promise
          resolved.then(callback);
          clock.tick(1000);
        } else {
          callback();
        }
      });
    });
  };

  /**
   * @template T
   * @param {() => T} condition
   * @returns {() => Promise<T>}
   */
  const waitForCondition = function (condition) {
    return () => repeatUntilCondition(condition);
  };

  afterEach(() => {
    clock = undefined;
    sinon.restore();
  });

  describe('main', () => {
    /** @type {import('sinon').SinonStub} */
    let tryStub;
    /** @type {import('sinon').SinonSpy} */
    let successSpy;
    /** @type {import('sinon').SinonSpy} */
    let endSpy;
    /** @type {import('sinon').SinonStub} */
    let retryStub;
    /** @type {import('..')} */
    let retryInstance;

    beforeEach(() => {
      tryStub = sinon.stub();
      successSpy = sinon.spy();
      endSpy = sinon.spy();
      retryStub = sinon.stub().returns(1);

      retryInstance = new Retry({
        'try': tryStub,
        success: successSpy,
        end: endSpy,
        retryDelay: retryStub,
        log: () => {}
      });
    });

    it('should fail if missing a required option', () => {
      // @ts-ignore
      should.Throw(() => new Retry({}), /Promised Retry needs to be provided a "try", "success" and "end" function/);
      // @ts-ignore
      should.Throw(() => new Retry({ 'try': () => {} }), /Promised Retry needs to be provided a "try", "success" and "end" function/);
      // @ts-ignore
      should.Throw(() => new Retry({ 'try': () => {}, success: () => {} }), /Promised Retry needs to be provided a "try", "success" and "end" function/);
    });

    it('should call success on successful try', async () => {
      tryStub.resolves('abc123');

      const result = await retryInstance.try();

      result.should.equal('abc123');

      tryStub.should.have.been.calledOnce;
      successSpy.should.have.been.calledOnce;
      successSpy.should.have.been.calledWith('abc123');
      endSpy.should.not.have.been.called;
      retryStub.should.not.have.been.called;
    });

    it('should do a proper retry', () => {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.onFirstCall().rejects(new Error('foo'));
      tryStub.onSecondCall().rejects(new Error('bar'));
      tryStub.resolves('abc123');

      let fulfilled = false;

      const result = retryInstance.try().then(() => {
        fulfilled = true;

        tryStub.should.have.been.calledThrice;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.calledOnce;
      }).catch(err => {
        fulfilled = true;
        throw err;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1))
        .then(waitForCondition(() => tryStub.callCount === 2 && retryStub.callCount === 2))
        .then(waitForCondition(() => fulfilled === true))
        .then(() => result);
    });

    it('should work with default retry', () => {
      clock = sinon.useFakeTimers(Date.now());

      retryInstance = new Retry({
        'try': tryStub,
        success: successSpy,
        end: endSpy,
        log: () => {}
      });

      tryStub.onFirstCall().rejects(new Error('foo'));
      tryStub.onSecondCall().rejects(new Error('bar'));
      tryStub.resolves('abc123');

      let fulfilled = false;

      const result = retryInstance.try().then(() => {
        fulfilled = true;

        tryStub.should.have.been.calledThrice;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.calledOnce;
      }).catch(err => {
        fulfilled = true;
        throw err;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1))
        .then(waitForCondition(() => tryStub.callCount === 2))
        .then(waitForCondition(() => fulfilled === true))
        .then(() => result);
    });

    it('should only attempt once, despite multiple calls', () => {
      tryStub.resolves('abc123');

      retryInstance.try();
      retryInstance.try();

      return retryInstance.try().then(result => {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        return retryInstance.try();
      }).then(result => {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        return retryInstance.try();
      });
    });

    it('should call end with successful result on end after success', () => {
      tryStub.resolves('abc123');

      return retryInstance.try()
        .then(() => retryInstance.end())
        .then(() => {
          tryStub.should.have.been.calledOnce;
          successSpy.should.have.been.calledOnce;
          successSpy.should.have.been.calledWith('abc123');
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith('abc123');
          retryStub.should.not.have.been.called;
        });
    });

    it('should abort retries on end call during retries', () => {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      retryInstance.try().then(() => {
        process.nextTick(() => {
          throw new Error('try() should not succeed');
        });
      }).catch(() => {});

      let waitTicks = 30;

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1 ? retryInstance.end() : false))
        .then(waitForCondition(() => --waitTicks === 0))
        .then(() => {
          tryStub.should.have.been.called;
          retryStub.should.have.been.calledOnce;
          successSpy.should.not.have.been.called;
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith();
        });
    });

    it('should not make any attempts if ended before the first one', () => {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      let waitTicks = 3;

      return retryInstance.end()
        .then(waitForCondition(() => --waitTicks === 0))
        .then(() => {
          tryStub.should.not.have.been.called;
          retryStub.should.not.have.been.called;
          successSpy.should.not.have.been.called;
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith();
        });
    });

    it('should ignore any attempts if ended', () => {
      tryStub.resolves('abc123');

      return retryInstance.end()
        .then(() => retryInstance.try())
        .then(
          () => { throw new Error('try() should not resolve after an ending'); },
          () => {
            tryStub.should.not.have.been.called;
            retryStub.should.not.have.been.called;
            successSpy.should.not.have.been.called;
            endSpy.should.have.been.calledOnce;
            endSpy.should.have.been.calledWith();
          }
        );
    });

    it('should abort when retry function says so', () => {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));
      retryStub.onFirstCall().returns(1);
      retryStub.returns(false);

      let fulfilled = false;

      const result = retryInstance.try().then(() => {
        fulfilled = true;
        throw new Error('try() should not succeed');
      }, () => {
        fulfilled = true;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1))
        .then(waitForCondition(() => fulfilled === true))
        .then(() => {
          tryStub.should.have.been.calledTwice;
          retryStub.should.have.been.calledTwice;

          return result;
        });
    });

    it('should make a new attempt if attempt is requested after a reset', () => {
      tryStub.onFirstCall().resolves('abc123');
      tryStub.resolves('xyz789');

      return retryInstance.try().then(result => {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        retryInstance.reset();

        return retryInstance.try();
      }).then(result => {
        result.should.equal('xyz789');

        tryStub.should.have.been.calledTwice;
        successSpy.should.have.been.calledTwice;
        successSpy.should.have.been.calledWith('xyz789');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;
      });
    });

    it('should abort retries after limit is reached', () => {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      retryInstance = new Retry({
        'try': tryStub,
        success: successSpy,
        end: endSpy,
        retryDelay: retryStub,
        log: () => {},
        retryLimit: 1
      });

      let fulfilled = false;

      const result = retryInstance.try().catch(err => {
        fulfilled = true;

        err.should.be.an('Error');
        err.message.should.equal('Retry limit reached');

        tryStub.should.have.been.calledTwice;
        successSpy.should.not.have.been.called;
        endSpy.should.not.have.been.called;
        retryStub.should.have.been.calledOnce;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1))
        .then(waitForCondition(() => tryStub.callCount === 2))
        .then(waitForCondition(() => fulfilled === true))
        .then(() => result);
    });
  });
});
