'use strict';

const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('yaml');

const identify_reviewers = require('./identify_reviewers');
const should_request_review = require('./should_request_review');

const context = github.context;
const token = core.getInput('token');
const config_path = core.getInput('config');
const octokit = github.getOctokit(token);

async function run() {
  core.info('Fetch configuration file from the base branch');
  const config = await fetch_config();

  const title = context.payload.pull_request.title;
  const is_draft = context.payload.pull_request.draft;

  if (!should_request_review({ title, is_draft, config })) {
    core.info('Matched the ignoring rules; skip requesting review');
    return;
  }

  core.info('Fetch changed files in the pull request');
  const changed_files = await fetch_changed_files();

  core.info('Identify reviewers based on the changed files and the configuration');
  const author = context.payload.pull_request.user.login;
  const reviewers = identify_reviewers({ config, changed_files, excludes: [ author ] });

  if (reviewers.length === 0) {
    core.info('Matched no reviweres; skip requesting review');
    return;
  }

  core.info(`Request review to ${reviewers.join(', ')}`);
  await assign_reviewers(reviewers);
}

async function fetch_config() {
  const { data: response_body } = await octokit.repos.getContent({
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: config_path,
    ref: context.payload.pull_request.base.ref, // base branch name the branch is going into
  });

  const content = Buffer.from(response_body.content, response_body.encoding).toString();
  return yaml.parse(content);
}

async function fetch_changed_files() {
  const changed_files = [];

  const per_page = 100;
  let page = 0;
  let number_of_files_in_current_page;

  do {
    page += 1;

    const { data: response_body } = await octokit.pulls.listFiles({
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
  return octokit.pulls.requestReviewers({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
    reviewers,
  });
}

run().catch((error) => core.setFailed(error));
