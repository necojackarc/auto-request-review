'use strict';

const core = require('@actions/core');
const fs = require('fs');
const github = require('@actions/github');
const partition = require('lodash/partition');
const yaml = require('yaml');
const { LOCAL_FILE_MISSING } = require('./constants');

const REVIEWER_ASSIGNMENT_EVENT_NAMES = [ 'pull_request', 'pull_request_target' ];

class PullRequest {
  // ref: https://developer.github.com/v3/pulls/#get-a-pull-request
  constructor(pull_request_paylaod) {
    // "ncc" doesn't yet support private class fields as of 29 Aug. 2020
    // ref: https://github.com/vercel/ncc/issues/499
    this._pull_request_paylaod = pull_request_paylaod;
  }

  get author() {
    return this._pull_request_paylaod.user.login;
  }

  get title() {
    return this._pull_request_paylaod.title;
  }

  get is_draft() {
    return this._pull_request_paylaod.draft;
  }
}

function get_pull_request() {
  const context = get_context();

  return new PullRequest(context.payload.pull_request);
}

function get_pull_request_number() {
  const context = get_context();

  if (context.payload.pull_request) {
    return context.payload.pull_request.number;
  }

  if (context.payload.issue && context.payload.issue.pull_request) {
    return context.payload.issue.number;
  }

  return undefined;
}

function is_reviewer_assignment_event() {
  const context = get_context();

  return REVIEWER_ASSIGNMENT_EVENT_NAMES.includes(context.eventName);
}

async function fetch_config() {
  const context = get_context();
  const octokit = get_octokit();
  const config_path = get_config_path();
  const useLocal = get_use_local();
  let content = '';

  if (!useLocal) {
    const { data: response_body } = await octokit.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: config_path,
      ref: context.ref,
    });

    content = Buffer.from(response_body.content, response_body.encoding).toString();
  } else {
    try {
      content = fs.readFileSync(config_path).toString();

      if (!content) {
        throw new Error();
      }
    } catch (error) {
      core.debug(`Error when reading local file: ${error}`);

      throw new Error(LOCAL_FILE_MISSING);
    }
  }

  return yaml.parse(content);
}

async function fetch_changed_files() {
  const context = get_context();
  const octokit = get_octokit();

  const changed_files = [];

  const per_page = 100;
  let page = 0;
  let number_of_files_in_current_page;

  do {
    page += 1;

    const { data: response_body } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      page,
      per_page,
    });

    number_of_files_in_current_page = response_body.length;
    changed_files.push(...response_body.map((file) => file.filename));

  } while (number_of_files_in_current_page === per_page);

  return changed_files;
}

async function assign_reviewers(reviewers) {
  const context = get_context();
  const octokit = get_octokit();

  const [ teams_with_prefix, individuals ] = partition(reviewers, (reviewer) => reviewer.startsWith('team:'));
  const teams = teams_with_prefix.map((team_with_prefix) => team_with_prefix.replace('team:', ''));

  return octokit.rest.pulls.requestReviewers({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
    reviewers: individuals,
    team_reviewers: teams,
  });
}

async function list_comments() {
  const context = get_context();
  const octokit = get_octokit();
  const pull_request_number = get_pull_request_number();

  const comments = [];

  const per_page = 100;
  let page = 0;
  let number_of_comments_in_current_page;

  do {
    page += 1;

    const { data: response_body } = await octokit.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pull_request_number,
      page,
      per_page,
    });

    number_of_comments_in_current_page = response_body.length;
    comments.push(...response_body);

  } while (number_of_comments_in_current_page === per_page);

  return comments;
}

async function list_reviews() {
  const context = get_context();
  const octokit = get_octokit();
  const pull_request_number = get_pull_request_number();

  const reviews = [];

  const per_page = 100;
  let page = 0;
  let number_of_reviews_in_current_page;

  do {
    page += 1;

    const { data: response_body } = await octokit.rest.pulls.listReviews({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pull_request_number,
      page,
      per_page,
    });

    number_of_reviews_in_current_page = response_body.length;
    reviews.push(...response_body);

  } while (number_of_reviews_in_current_page === per_page);

  return reviews;
}

async function get_permission_level(username) {
  const context = get_context();
  const octokit = get_octokit();

  const { data: response_body } = await octokit.rest.repos.getCollaboratorPermissionLevel({
    owner: context.repo.owner,
    repo: context.repo.repo,
    username,
  });

  return response_body.permission;
}

async function get_pull_request_head_sha() {
  const context = get_context();

  if (context.payload.pull_request) {
    return context.payload.pull_request.head.sha;
  }

  const octokit = get_octokit();
  const pull_request_number = get_pull_request_number();

  const { data: response_body } = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pull_request_number,
  });

  return response_body.head.sha;
}

async function create_check_run({ head_sha, conclusion, summary }) {
  const context = get_context();
  const octokit = get_octokit();

  return octokit.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: 'require-review',
    head_sha,
    status: 'completed',
    conclusion,
    output: {
      title: conclusion === 'success' ? 'All required reviews are approved' : 'Missing required approving review(s)',
      summary,
    },
  });
}

/* Private */

let context_cache;
let token_cache;
let config_path_cache;
let use_local_cache;
let octokit_cache;

function get_context() {
  return context_cache || (context_cache = github.context);
}

function get_token() {
  return token_cache || (token_cache = core.getInput('token'));
}

function get_config_path() {
  return config_path_cache || (config_path_cache = core.getInput('config'));
}

function get_use_local() {
  return use_local_cache ?? (use_local_cache = core.getInput('use_local') === 'true');
}

function get_octokit() {
  if (octokit_cache) {
    return octokit_cache;
  }

  const token = get_token();
  return octokit_cache = github.getOctokit(token);
}

function clear_cache() {
  context_cache = undefined;
  token_cache = undefined;
  config_path_cache = undefined;
  octokit_cache = undefined;
}

module.exports = {
  get_pull_request,
  get_pull_request_number,
  is_reviewer_assignment_event,
  fetch_config,
  fetch_changed_files,
  assign_reviewers,
  list_comments,
  list_reviews,
  get_permission_level,
  get_pull_request_head_sha,
  create_check_run,
  clear_cache,
};
