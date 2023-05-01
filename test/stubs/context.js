'use strict';

const fs = require('fs');

class ContextStub {
  static build(properties_overrides = {}) {
    const default_properties = JSON.parse(fs.readFileSync(`${__dirname}/context_properties.json`));
    return new this({
      ...default_properties,
      ...properties_overrides,
    });
  }

  constructor(properties) {
    Object.assign(this, properties);
  }

  // Not sure how repo is implemented but JSON.stringify(context) doesn't give a `repo` attribute,
  // so it seems like just a JavaScript getter (a.k.a. computed property).
  // As far as I can tell, it always returns `owner` and `repo` of the base branch.
  // Quite possibly, you can derive them from a context payload but this looks good enough for now.
  // ref: https://github.com/actions/toolkit/tree/main/packages/github
  get repo() {
    return {
      owner: 'necojackarc',
      repo: 'auto-request-review',
      org: 'necojackarc',
    };
  }
}

module.exports = {
  ContextStub,
};
