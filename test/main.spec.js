'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const should = chai.should();
chai.use(sinonChai);

describe('Retry', function () {
  const Retry = require('../');

  const resolved = Promise.resolve();

  let clock;

  const repeatUntilCondition = function (condition, count) {
    return new Promise(function (resolve, reject) {
      if (count > 100) { return reject(new Error('repeatUntilCondition repeated for too long')); }

      process.nextTick(function () {
        const callback = function () {
          resolve(condition() || repeatUntilCondition(condition, count ? count + 1 : 1));
        };
        if (clock) {
          resolved.then(callback);
          clock.tick(1000);
        } else {
          callback();
        }
      });
    });
  };

  const waitForCondition = function (condition) {
    return function () {
      return repeatUntilCondition(condition);
    };
  };

  afterEach(function () {
    clock = undefined;
    sinon.restore();
  });

  describe('main', function () {
    let tryStub, successSpy, endSpy, retryStub, retryInstance;

    beforeEach(function () {
      tryStub = sinon.stub();
      successSpy = sinon.spy();
      endSpy = sinon.spy();
      retryStub = sinon.stub().returns(1);

      retryInstance = new Retry({
        try: tryStub,
        success: successSpy,
        end: endSpy,
        retryDelay: retryStub,
        log: function () {}
      });
    });

    it('should call success on successful try', function () {
      tryStub.resolves('abc123');

      return retryInstance.try().then(function (result) {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;
      });
    });

    it('should do a proper retry', function () {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.onFirstCall().rejects(new Error('foo'));
      tryStub.onSecondCall().rejects(new Error('bar'));
      tryStub.resolves('abc123');

      let fulfilled = false;

      const result = retryInstance.try().then(function () {
        fulfilled = true;

        tryStub.should.have.been.calledThrice;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.calledOnce;
      }).catch(function (err) {
        fulfilled = true;
        throw err;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1))
        .then(waitForCondition(() => tryStub.callCount === 2 && retryStub.callCount === 2))
        .then(waitForCondition(() => fulfilled === true))
        .then(() => result);
    });

    it('should work with default retry', function () {
      clock = sinon.useFakeTimers(Date.now());

      retryInstance = new Retry({
        try: tryStub,
        success: successSpy,
        end: endSpy,
        log: function () {}
      });

      tryStub.onFirstCall().rejects(new Error('foo'));
      tryStub.onSecondCall().rejects(new Error('bar'));
      tryStub.resolves('abc123');

      let fulfilled = false;

      const result = retryInstance.try().then(function () {
        fulfilled = true;

        tryStub.should.have.been.calledThrice;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.calledOnce;
      }).catch(function (err) {
        fulfilled = true;
        throw err;
      });

      return Promise.resolve()
        .then(waitForCondition(function () {
          return tryStub.callCount === 1;
        }))
        .then(waitForCondition(function () {
          return tryStub.callCount === 2;
        }))
        .then(waitForCondition(function () {
          return fulfilled === true;
        }))
        .then(function () {
          return result;
        });
    });

    it('should only attempt once, despite multiple calls', function () {
      tryStub.resolves('abc123');

      retryInstance.try();
      retryInstance.try();

      return retryInstance.try().then(function (result) {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        return retryInstance.try();
      }).then(function (result) {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        return retryInstance.try();
      });
    });

    it('should accept a regular node.js-style callback on the try() method', function (done) {
      tryStub.resolves('abc123');

      retryInstance.try(function (err, result) {
        try {
          should.not.exist(err);
          should.exist(result);

          result.should.equal('abc123');

          tryStub.should.have.been.calledOnce;
          successSpy.should.have.been.calledOnce;
          successSpy.should.have.been.calledWith('abc123');
          endSpy.should.not.have.been.called;
          retryStub.should.not.have.been.called;

          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should call end with successful result on end after success', function () {
      tryStub.resolves('abc123');

      return retryInstance.try()
        .then(() => retryInstance.end())
        .then(function () {
          tryStub.should.have.been.calledOnce;
          successSpy.should.have.been.calledOnce;
          successSpy.should.have.been.calledWith('abc123');
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith('abc123');
          retryStub.should.not.have.been.called;
        });
    });

    it('should abort retries on end call during retries', function () {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      retryInstance.try().then(function () {
        process.nextTick(function () {
          throw new Error('try() should not succeed');
        });
      }).catch(() => {});

      let waitTicks = 30;

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1 ? retryInstance.end() : false))
        .then(waitForCondition(() => --waitTicks === 0))
        .then(function () {
          tryStub.should.have.been.called;
          retryStub.should.have.been.calledOnce;
          successSpy.should.not.have.been.called;
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith(undefined);
        });
    });

    it('should not make any attempts if ended before the first one', function () {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      let waitTicks = 3;

      return retryInstance.end()
        .then(waitForCondition(() => --waitTicks === 0))
        .then(function () {
          tryStub.should.not.have.been.called;
          retryStub.should.not.have.been.called;
          successSpy.should.not.have.been.called;
          endSpy.should.have.been.calledOnce;
          endSpy.should.have.been.calledWith(undefined);
        });
    });

    it('should ignore any attempts if ended', function () {
      tryStub.resolves('abc123');

      return retryInstance.end()
        .then(() => retryInstance.try())
        .then(
          () => Promise.reject(new Error('try() should not resolve after an ending')),
          function () {
            tryStub.should.not.have.been.called;
            retryStub.should.not.have.been.called;
            successSpy.should.not.have.been.called;
            endSpy.should.have.been.calledOnce;
            endSpy.should.have.been.calledWith(undefined);
          }
        );
    });

    it('should abort when retry function says so', function () {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));
      retryStub.onFirstCall().returns(1);
      retryStub.returns(false);

      let fulfilled = false;

      const result = retryInstance.try().then(function () {
        fulfilled = true;
        throw new Error('try() should not succeed');
      }, function () {
        fulfilled = true;
      });

      return Promise.resolve()
        .then(waitForCondition(() => tryStub.callCount === 1 && retryStub.callCount === 1))
        .then(waitForCondition(() => fulfilled === true))
        .then(function () {
          tryStub.should.have.been.calledTwice;
          retryStub.should.have.been.calledTwice;

          return result;
        });
    });

    it('should make a new attempt if attempt is requested after a reset', function () {
      tryStub.onFirstCall().resolves('abc123');
      tryStub.resolves('xyz789');

      return retryInstance.try().then(function (result) {
        result.should.equal('abc123');

        tryStub.should.have.been.calledOnce;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;

        retryInstance.reset();

        return retryInstance.try();
      }).then(function (result) {
        result.should.equal('xyz789');

        tryStub.should.have.been.calledTwice;
        successSpy.should.have.been.calledTwice;
        successSpy.should.have.been.calledWith('xyz789');
        endSpy.should.not.have.been.called;
        retryStub.should.not.have.been.called;
      });
    });

    it('should abort retries after limit is reached', function () {
      clock = sinon.useFakeTimers(Date.now());

      tryStub.rejects(new Error('foo'));

      retryInstance = new Retry({
        try: tryStub,
        success: successSpy,
        end: endSpy,
        retryDelay: retryStub,
        log: function () {},
        retryLimit: 1
      });

      let fulfilled = false;

      const result = retryInstance.try().catch(function (err) {
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
