'use strict';

const core = require('@actions/core');
const fs = require('fs');
const github = require('@actions/github');
const partition = require('lodash/partition');
const yaml = require('yaml');
const { LOCAL_FILE_MISSING } = require('./constants');

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

async function fetch_config() {
  const context = get_context();
  const octokit = get_octokit();
  const config_path = get_config_path();
  const useLocal = get_use_local();
  let content = '';

  if (!useLocal) {
    const { data: response_body } = await octokit.repos.getContent({
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

async function is_collaborator(person) {
  const context = get_context();
  const octokit = get_octokit();

  return await octokit.repos.checkCollaborator({
    owner: context.repo.owner,
    repo: context.repo.repo,
    username: person,
  }).then(
    (response) => {
      if (response.status === 204) {
        return true;
      }
      return false;
    },
    (error) => {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  );
}

async function assign_reviewers(reviewers) {
  const context = get_context();
  const octokit = get_octokit();

  const [ teams_with_prefix, individuals ] = partition(reviewers, (reviewer) => reviewer.startsWith('team:'));
  const teams = teams_with_prefix.map((team_with_prefix) => team_with_prefix.replace('team:', ''));

  const comment_prefix = 'Auto-requesting reviews from non-collaborators: ';
  const mention_prefix = '@';

  const review_requested = new Set(await octokit.paginate(
    octokit.pulls.listRequestedReviewers,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    }
  ));
  const review_list = await octokit.paginate(
    octokit.pulls.listReviews,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    }
  );
  const review_comments = await octokit.paginate(
    octokit.pulls.listReviewComments,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    }
  );
  // Only consider mentions starting with the prefix
  const already_mentioned = new Set(review_list.filter((review) => (
    review.body.startsWith(comment_prefix)
  )).map(
    (review) => review.body.substring(comment_prefix.length).split(' ').filter(
      (mention) => mention.startsWith(mention_prefix)
    ).map(
      (mention) => mention.substring(mention_prefix.length)
    )
  ).reduce(
    (mentions, new_mentions) => mentions.concat(new_mentions), []
  ));
  // Review and review comments
  const already_reviewed = new Set(review_list.filter(
    (review) => review.user !== null
  ).map((review) => review.user.login));
  const already_commented_review = new Set(review_comments.filter(
    (review) => review.user.login !== null
  ).map((review) => review.user.login));

  const [ collaborators, non_collaborators ] = partition(
    await Promise.all(individuals.filter((person) => (
      !review_requested.has(person)
      && !already_mentioned.has(person)
      && !already_reviewed.has(person)
      && !already_commented_review.has(person)
      && person !== context.payload.pull_request.user.login
    )).map(
      async (person) => ({
        person: person,
        status: await is_collaborator(person),
      })
    )),
    ({ status }) => status
  ).map(
    (list) => list.map(
      ({ person }) => person
    )
  );

  const request_response = (collaborators.length === 0 && teams.length === 0)
    ? null
    : await octokit.pulls.requestReviewers({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      reviewers: collaborators,
      team_reviewers: teams,
    });

  const mention_response = non_collaborators.length === 0
    ? null
    : await octokit.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      body: comment_prefix + non_collaborators.map((person) => mention_prefix + person).join(' '),
      event: 'COMMENT',
    });

  return {
    request_response: request_response,
    mention_response: mention_response,
  };
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
  fetch_config,
  fetch_changed_files,
  assign_reviewers,
  clear_cache,
};
