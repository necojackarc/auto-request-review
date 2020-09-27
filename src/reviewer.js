'use strict';

const core = require('@actions/core');
const minimatch = require('minimatch');

function fetch_other_group_members({ author, config }) {
  const DEFAULT_OPTIONS = {
    enable_group_assignment: false,
  };

  const { enable_group_assignment: should_group_assign } = {
    ...DEFAULT_OPTIONS,
    ...config.options,
  };

  if (!should_group_assign) {
    core.info('Group assignment feature is disabled');
    return [];
  }

  core.info('Group assignment feature is enabled');

  const groups = (config.reviewers && config.reviewers.groups) || {};
  const belonging_group_names = Object.entries(groups).map(([ group_name, members ]) =>
    members.includes(author) ? group_name : undefined
  ).filter((group_name) => group_name);

  const other_group_members = belonging_group_names.flatMap((group_name) =>
    groups[group_name]
  ).filter((group_member) => group_member !== author);

  return [ ...new Set(other_group_members) ];
}

function identify_reviewers_by_changed_files({ config, changed_files, excludes = [] }) {
  if (!config.files) {
    core.info('A "files" key does not exist in config; returning no reviwers for changed files.');
    return [];
  }

  const matching_reviwers = [];

  Object.entries(config.files).forEach(([ glob_pattern, reviewers ]) => {
    if (changed_files.some((changed_file) => minimatch(changed_file, glob_pattern))) {
      matching_reviwers.push(...reviewers);
    }
  });

  const indivisuals = replace_groups_with_individuals({ reviewers: matching_reviwers, config });

  // Depue and filter the results
  return [ ...new Set(indivisuals) ].filter((reviewer) => !excludes.includes(reviewer));
}

function should_request_review({ title, is_draft, config }) {
  const DEFAULT_OPTIONS = {
    ignore_draft: true,
    ignored_keywords: [ 'DO NOT REVIEW' ],
  };

  const { ignore_draft: should_ignore_draft, ignored_keywords } = {
    ...DEFAULT_OPTIONS,
    ...config.options,
  };

  if (should_ignore_draft && is_draft) {
    return false;
  }

  return !ignored_keywords.some((keyword) => title.includes(keyword));
}

function fetch_default_reviwers({ config, excludes = [] }) {
  if (!config.reviewers || !Array.isArray(config.reviewers.defaults)) {
    return [];
  }

  const indivisuals = replace_groups_with_individuals({ reviewers: config.reviewers.defaults, config });

  // Depue and filter the results
  return [ ...new Set(indivisuals) ].filter((reviewer) => !excludes.includes(reviewer));
}

/* Private */

function replace_groups_with_individuals({ reviewers, config }) {
  const groups = (config.reviewers && config.reviewers.groups) || {};
  return reviewers.flatMap((reviewer) =>
    Array.isArray(groups[reviewer]) ? groups[reviewer] : reviewer
  );
}

module.exports = {
  fetch_other_group_members,
  identify_reviewers_by_changed_files,
  should_request_review,
  fetch_default_reviwers,
};
