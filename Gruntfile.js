/*jslint node: true */
'use strict';

var lintlovin = require('lintlovin');

module.exports = function (grunt) {
  lintlovin.initConfig(grunt, {}, {
    spaceFiles: ['!package.json'],
    enableCoverageEvent: true
  });

  grunt.event.on('coverage', function (lcov, done) {
    if (!process.env.TRAVIS) { return done(); }

    require('coveralls').handleInput(lcov, function (err) {
      if (err) { return done(err); }
      done();
    });
  });
};
