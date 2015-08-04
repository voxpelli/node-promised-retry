/* jshint node: true, expr: true */
/* global beforeEach, afterEach, describe, it */

'use strict';

var chai = require('chai');
var sinon = require('sinon');
require('sinon-as-promised');
var sinonChai = require('sinon-chai');

chai.should();
chai.use(sinonChai);

describe('Retry', function () {
  var Retry = require('../');

  var clock;

  var repeatUntilCondition = function (condition) {
    return new Promise(function (resolve) {
      process.nextTick(function () {
        var callback = function () {
          resolve(condition() ? undefined : repeatUntilCondition(condition));
        };
        if (clock) {
          setImmediate(callback);
          clock.tick(1000);
        } else {
          callback();
        }
      });
    });
  };

  var waitForCondition = function (condition) {
    return function () {
      return repeatUntilCondition(condition);
    };
  };

  afterEach(function () {
    if (clock) {
      clock.restore();
      clock = undefined;
    }
  });

  describe('callbacks', function () {
    var tryStub, successSpy, endSpy, retryStub, retryInstance;

    beforeEach(function () {
      tryStub = sinon.stub();
      successSpy = sinon.spy();
      endSpy = sinon.spy();
      retryStub = sinon.stub();

      retryInstance = new Retry({
        try: tryStub,
        success: successSpy,
        end: endSpy,
        retryDelay: retryStub,
      });
    });

    it('should call success on successful try', function () {
      tryStub.resolves('abc123');

      return retryInstance.try().then(function () {
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

      retryStub.returns(1);

      var fulfilled = false;

      var result = retryInstance.try().then(function () {
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
          return tryStub.callCount === 1 && retryStub.callCount === 1;
        }))
        .then(waitForCondition(function () {
          return tryStub.callCount === 2 && retryStub.callCount === 2;
        }))
        .then(waitForCondition(function () {
          return fulfilled === true;
        }))
        .then(function () {
          return result;
        });
    });

  });

});
