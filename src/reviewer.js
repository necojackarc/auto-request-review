'use strict';

const core = require('@actions/core');
const minimatch = require('minimatch');
const sample_size = require('lodash/sampleSize');
const github = require('./github'); // Don't destructure this object to stub with sinon in tests

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
  const DEFAULT_OPTIONS = {
    last_files_match_only: false,
  };

  const { last_files_match_only } = {
    ...DEFAULT_OPTIONS,
    ...config.options,
  };

  if (!config.files) {
    core.info('A "files" key does not exist in config; returning no reviewers for changed files.');
    return [];
  }

  const matching_reviewers = [];

  Object.entries(config.files).forEach(([ glob_pattern, reviewers ]) => {
    if (changed_files.some((changed_file) => minimatch(changed_file, glob_pattern))) {
      if (last_files_match_only) {
        matching_reviewers.length = 0; // clear previous matches
      }
      matching_reviewers.push(...reviewers);
    }
  });

  const individuals = replace_groups_with_individuals({ reviewers: matching_reviewers, config });

  // Depue and filter the results
  return [ ...new Set(individuals) ].filter((reviewer) => !excludes.includes(reviewer));
}

async function identify_reviewers_by_author({ config, 'author': specified_author }) {
  if (!(config.reviewers && config.reviewers.per_author)) {
    core.info('"per_author" is not set; returning no reviewers for the author.');
    return [];
  }

  // async behavior must happen first
  const team_member_promises = await Object.keys(config.reviewers.per_author).map(async (author) => {
    if (author.startsWith('team:')) {
      const team = author.replace('team:', '');

      return {
        author,
        members: await github.get_team_members(team) || [],
      };
    }

    return {
      author,
      members: [],
    };
  });
  const team_members = await Promise.all(team_member_promises);

  // More than one author can be matched because groups are set as authors
  const matching_authors = Object.keys(config.reviewers.per_author).filter((author) => {
    if (author === specified_author) {
      return true;
    }

    if (author.startsWith('team:')) {
      const { members } = team_members.find((team) => team.author === author);
      if (members.includes(specified_author)) {
        return true;
      }
    }

    const individuals_in_author_setting = replace_groups_with_individuals({ reviewers: [ author ], config });

    if (individuals_in_author_setting?.includes(specified_author)) {
      return true;
    }

    return false;
  });

  const matching_reviewers = matching_authors.flatMap((matching_author) => {
    const reviewers = config.reviewers.per_author[matching_author] || [];
    return replace_groups_with_individuals({ reviewers, config });
  });

  return matching_reviewers.filter((reviewer) => reviewer !== specified_author);
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

function fetch_default_reviewers({ config, excludes = [] }) {
  if (!config.reviewers || !Array.isArray(config.reviewers.defaults)) {
    return [];
  }

  const individuals = replace_groups_with_individuals({ reviewers: config.reviewers.defaults, config });

  // Depue and filter the results
  return [ ...new Set(individuals) ].filter((reviewer) => !excludes.includes(reviewer));
}

function randomly_pick_reviewers({ reviewers, config }) {
  const { number_of_reviewers } = {
    ...config.options,
  };

  if (number_of_reviewers === undefined) {
    return reviewers;
  }

  return sample_size(reviewers, number_of_reviewers);
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
  identify_reviewers_by_author,
  should_request_review,
  fetch_default_reviewers,
  randomly_pick_reviewers,
};
