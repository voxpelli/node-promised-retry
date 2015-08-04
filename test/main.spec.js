/* jshint node: true, expr: true */
/* global beforeEach, afterEach, describe, it, -Promise */

'use strict';

var chai = require('chai');
var sinon = require('sinon');
require('sinon-as-promised');
var sinonChai = require('sinon-chai');

var Promise = require('promise');

chai.should();
chai.use(sinonChai);

describe('Retry', function () {
  var Retry = require('../');

  var clock;

  var nextTickUntilCondition = function (condition) {
    return new Promise(function (resolve) {
      process.nextTick(function () {
        resolve(condition() ? undefined : nextTickUntilCondition(condition));
      });
    });
  };

  var waitForNextTickCondition = function (condition) {
    return function () {
      return nextTickUntilCondition(condition);
    };
  };

  var waitForTimers = function () {
    return new Promise(function (resolve) {
      setImmediate(function () {
        resolve();
      });
      clock.tick(10);
    });
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

      console.log('START!');

      var result = retryInstance.try().then(function () {
        tryStub.should.have.been.calledThrice;
        successSpy.should.have.been.calledOnce;
        successSpy.should.have.been.calledWith('abc123');
        endSpy.should.not.have.been.calledOnce;
      });

      return Promise.resolve()
        .then(waitForNextTickCondition(function () {
          return tryStub.callCount === 1 && retryStub.callCount === 1;
        }))
        .then(waitForTimers)
        .then(waitForNextTickCondition(function () {
          return tryStub.callCount === 2 && retryStub.callCount === 2;
        }))
        .then(waitForTimers)
        .then(function () {
          return result;
        });

    });

  });

});
