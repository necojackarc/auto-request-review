'use strict';

const DEFAULT_OPTIONS = {
  ignore_draft: true,
  ignored_keywords: [ 'DO NOT REVIEW' ],
};

function should_request_review({ title, is_draft, config }) {
  const {
    ignore_draft: should_ignore_draft,
    ignored_keywords = [], // fall back to an empty array if it's not supplied
  } = config.options || DEFAULT_OPTIONS;

  if (should_ignore_draft && is_draft) {
    return false;
  }

  return !ignored_keywords.some((keyword) => title.includes(keyword));
}

module.exports = should_request_review;
