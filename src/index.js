'use strict';

const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('yaml');

async function run() {
  console.log('The action is successfully invoked!');

  // Initialise
  const context = github.context;
  const token = core.getInput('token');
  const config_path = core.getInput('config');
  const octokit = github.getOctokit(token);

  // Fetch the pull request
  const { data: pull_request } = await octokit.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
  });

  // Fetch the config file
  const fetch_config = async () => {
    const { data: response_body } = await octokit.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: config_path,
      ref: pull_request.head.ref, // branch name the pull request is on
    });

    const content = Buffer.from(response_body.content, response_body.encoding).toString();
    return yaml.parse(content);
  };
  const config = await fetch_config();

  // Fetch the changed files
  const fetch_changed_files = async () => {
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
  };
  const changed_files = await fetch_changed_files();

  // TODO: Parse config, identify reviewers, then assign reviewres
  console.log(config);
  console.log(changed_files);
}

run();
