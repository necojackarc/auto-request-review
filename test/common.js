'use strict';

const core = require('@actions/core');
const sinon = require('sinon');

before(function() {
  // Don't show logs in tests
  sinon.stub(core, 'info');
  sinon.stub(core, 'warning');
});

after(function() {
  core.info.restore();
  core.warning.restore();
});
