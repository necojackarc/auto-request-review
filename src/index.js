'use strict';

const core = require('@actions/core');
const github = require('./github'); // Don't destructure this object to stub with sinon in tests

const {
  fetch_other_group_members,
  identify_reviewers_by_changed_files,
  should_request_review,
  fetch_default_reviwers,
} = require('./reviewer');

async function run() {
  core.info('Fetching configuration file from the base branch');

  let config;

  try {
    config = await github.fetch_config();
  } catch (error) {
    if (error.status === 404) {
      core.warning('No configuration file is found in the base branch; terminating the process');
      return;
    }
    throw error;
  }

  const { title, is_draft, author } = github.get_pull_request();

  if (!should_request_review({ title, is_draft, config })) {
    core.info('Matched the ignoring rules; terminating the process');
    return;
  }

  core.info('Fetching changed files in the pull request');
  const changed_files = await github.fetch_changed_files();

  core.info('Identifying reviewers based on the changed files and the configuration');
  const reviewers_based_on_files = identify_reviewers_by_changed_files({ config, changed_files, excludes: [ author ] });

  core.info('Adding other group membres to reviwers if group assignment feature is on');
  const reviwers_from_same_teams = fetch_other_group_members({ config, author });

  const reviewers = [ ...new Set([ ...reviewers_based_on_files, ...reviwers_from_same_teams ]) ];

  if (reviewers.length === 0) {
    core.info('Matched no reviwers');
    const default_reviwers = fetch_default_reviwers({ config, excludes: [ author ] });

    if (default_reviwers.length === 0) {
      core.info('No default reviwers are matched; terminating the process');
      return;
    }

    core.info('Falling back to the default reviwers');
    reviewers.push(...default_reviwers);
  }

  core.info(`Requesting review to ${reviewers.join(', ')}`);
  await github.assign_reviewers(reviewers);
}

module.exports = {
  run,
};

// Run the action if it's not running in an automated testing environment
if (process.env.NODE_ENV !== 'automated-testing') {
  run().catch((error) => core.setFailed(error));
}
