'use strict';

const core = require('@actions/core');
const { LOCAL_FILE_MISSING } = require('./constants');
const github = require('./github'); // Don't destructure this object to stub with sinon in tests

const {
  fetch_other_group_members,
  identify_reviewers_by_changed_files,
  identify_reviewers_by_author,
  should_request_review,
  fetch_default_reviewers,
  randomly_pick_reviewers,
} = require('./reviewer');

const {
  parse_required_reviewers,
  is_authorized_permission,
  identify_approved_reviewers,
  identify_missing_reviewers,
} = require('./require_review');

async function run() {
  const pull_request_number = github.get_pull_request_number();

  if (pull_request_number === undefined) {
    core.info('The comment is not on a pull request; terminating the process');
    return;
  }

  if (github.has_full_pull_request_payload()) {
    await auto_assign_reviewers();
  }

  await enforce_required_reviews();
}

async function auto_assign_reviewers() {
  core.info('Fetching configuration file from the source branch');

  let config;

  try {
    config = await github.fetch_config();
  } catch (error) {
    if (error.status === 404) {
      core.warning('No configuration file is found in the base branch; terminating the process');
      return;
    }

    if (error.message === LOCAL_FILE_MISSING) {
      core.warning('No configuration file is found locally; terminating the process');
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

  core.info('Identifying reviewers based on the changed files');
  const reviewers_based_on_files = identify_reviewers_by_changed_files({ config, changed_files, excludes: [ author ] });

  core.info('Identifying reviewers based on the author');
  const reviewers_based_on_author = identify_reviewers_by_author({ config, author });

  core.info('Adding other group members to reviewers if group assignment feature is on');
  const reviewers_from_same_teams = fetch_other_group_members({ config, author });

  let reviewers = [ ...new Set([ ...reviewers_based_on_files, ...reviewers_based_on_author, ...reviewers_from_same_teams ]) ];

  if (reviewers.length === 0) {
    core.info('Matched no reviewers');
    const default_reviewers = fetch_default_reviewers({ config, excludes: [ author ] });

    if (default_reviewers.length === 0) {
      core.info('No default reviewers are matched; terminating the process');
      return;
    }

    core.info('Falling back to the default reviewers');
    reviewers.push(...default_reviewers);
  }

  core.info('Randomly picking reviewers if the number of reviewers is set');
  reviewers = randomly_pick_reviewers({ reviewers, config });

  core.info(`Requesting review to ${reviewers.join(', ')}`);
  await github.assign_reviewers(reviewers);
}

async function enforce_required_reviews() {
  core.info('Checking for "require-review" directives in the pull request comments');

  const comments = await github.list_comments();
  const required_reviewers = new Set();

  for (const comment of comments) {
    const usernames = parse_required_reviewers(comment.body);

    if (usernames.length === 0) {
      continue;
    }

    const permission = await github.get_permission_level(comment.user.login);

    if (!is_authorized_permission(permission)) {
      core.info(`Ignoring "require-review" directive from @${comment.user.login}; insufficient permission`);
      continue;
    }

    usernames.forEach((username) => required_reviewers.add(username));
  }

  if (required_reviewers.size === 0) {
    return;
  }

  core.info(`Required reviewer(s) by directive: ${[ ...required_reviewers ].join(', ')}`);

  const reviews = await github.list_reviews();
  const approved_reviewers = identify_approved_reviewers(reviews);
  const missing_reviewers = identify_missing_reviewers({
    required_reviewers: [ ...required_reviewers ],
    approved_reviewers,
  });

  // A job triggered by "issue_comment" has no commit sha in its payload.
  // Without this, its check run would land only in the Actions tab, not on the PR.
  const head_sha = await github.get_pull_request_head_sha();

  if (missing_reviewers.length > 0) {
    const summary = `Missing required approving review(s) from: ${missing_reviewers.join(', ')}`;
    await github.create_check_run({ head_sha, conclusion: 'failure', summary });
    core.setFailed(summary);
    return;
  }

  await github.create_check_run({
    head_sha,
    conclusion: 'success',
    summary: `All required reviewer(s) have approved: ${[ ...required_reviewers ].join(', ')}`,
  });
}

module.exports = {
  run,
};

// Run the action if it's not running in an automated testing environment
if (process.env.NODE_ENV !== 'automated-testing') {
  run().catch((error) => core.setFailed(error));
}
