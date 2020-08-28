# Request Review Based on Files

![Test](https://github.com/necojackarc/request-review-based-on-files/workflows/Test/badge.svg)

A GitHub Action that automatically requests review of a pull request based on files changed

## Motivation
You can automate reviewer assignment process using [code owners](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/about-code-owners) if you'd like to define reviewers based on changed files.
However, you may want to distinguish just reviewers from code owners in order to properly use code-owner-related features on GitHub. Even if you don't use such features, distinguishing them can be helpful especially for someone new to your repository as they may have no idea yet about who is responsible for what.

## Configuration

Create a configuration file where you can define code reviwers using [glob](https://en.wikipedia.org/wiki/Glob_(programming)).
Internally, [minimatch](https://github.com/isaacs/minimatch) is used as a glob implementation.

The format of a configuration file is as follows:

```yaml
reviewers:
  # You can define groups.
  groups:
    repository-owner:
      - me
    core-contributors:
      - good-boy
      - good-girl
    js-lovers:
      - js-man
      - js-woman

files:
  # Keys are glob expressions.
  # You can assign groups/indivisuals as reviewers.
  '**':
    - repository-owner # group
  '**/*.js':
    - core-contributors # group
    - js-lovers # group
  '**/*.yml':
    - core-contributors # group
    - yamler # indivisual
  '.github/**':
    - octopus # indivisual
    - cat # indivisual

# Some options that can prevent the action from requesting review.
# These are the default options.
options:
  ignore_draft: true
  ignored_keywords:
    - DO NOT REVIEW
  enable_group_assignment: false
```

The default location of the configuration file is `.github/request_review_based_on_files.yml` but you can override it.

Then, create a workflow file in `.github/workflows` (e.g. `.github/workflows/request_review_based_on_files.yml`):

```yaml
name: Request Review Based on Files

on:
  pull_request:
    types: [opened, ready_for_review, reopened]

jobs:
  request-review-based-on-files:
    name: Request review based on files changed
    runs-on: ubuntu-latest
    steps:
      - name: Assign reviewers to a pull request based on files changed
        uses: necojackarc/request-review-based-on-files@v0.0.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config: .github/reviewers.yml # You can override the config file location like this.
```

### Group Assignment
Besides the main feature to assign reviwers based on changed files, this action also supports group assignment.
If you set `options.enable_group_assignment` `true`, the other members of the team(s) that the author belongs to will be requested for code review.
