'use strict';

const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('yaml');

const identify_reviewers = require('./identify_reviewers');

const context = github.context;
const token = core.getInput('token');
const config_path = core.getInput('config');
const octokit = github.getOctokit(token);

async function run() {
  core.info('Fetch pull request');
  const pull_request = await fetch_pull_request();

  core.info('Fetch configuration file');
  const config = await fetch_config(pull_request);

  core.info('Fetch changed files');
  const changed_files = await fetch_changed_files();

  core.info('Identify reviewers based on the changed files and the configuration');
  const author = pull_request.user.login;
  const reviewers = identify_reviewers({ config, changed_files, excludes: [ author ] });

  core.info(`Request review to ${reviewers.join(', ')}`);
  await assign_reviewers(reviewers);
}

async function fetch_pull_request() {
  const { data: pull_request } = await octokit.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
  });

  return pull_request;
}

async function fetch_config(pull_request) {
  console.log(github.context);
  console.log(pull_request);

  const { data: response_body } = await octokit.repos.getContent({
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: config_path,
    ref: pull_request.head.ref, // branch name the pull request is on
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

    const { data: response_body } =  await octokit.pulls.listFiles({
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
