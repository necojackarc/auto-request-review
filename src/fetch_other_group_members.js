'use strict';

const core = require('@actions/core');

const DEFAULT_OPTIONS = {
  enable_group_assignment: false,
};

function fetch_other_group_members({ author, config }) {
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

module.exports = fetch_other_group_members;
