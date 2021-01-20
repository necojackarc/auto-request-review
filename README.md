# Auto Request Review

![CI](https://github.com/necojackarc/auto-request-review/workflows/CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/necojackarc/auto-request-review/badge.svg?branch=master)](https://coveralls.io/github/necojackarc/auto-request-review?branch=master)

A GitHub Action automatically requests review of a pull request based on files changes and/or groups the author belongs to 🤖

## Motivation
It varies depending on the team who should review which pull requests. In some teams, review requests are randomly assigned while others prefer to have them reviewed by every one of the team members. With the default features, [code review assignments](https://docs.github.com/en/github/setting-up-and-managing-organizations-and-teams/managing-code-review-assignment-for-your-team) and [code owners](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/about-code-owners), you can cover only a couple of use cases - in other words, there are other cases they don't cover.

This GitHub Action best suits any of the following needs:

- You'd like to request review based on files changed
- You'd like to specify reviewers per author
- You'd like to get all of the other team members to review
- You'd like to keep code owners real code owners, not just reviewers
- You'd like to randomly pick reviewers based on the conditions mentioned above

Overall, if you'd like to request review to a certain set of members based on groups and/or files changed, this GitHub Action works best.

### Code owners vs reviewers
Code owners own or are responsible for the code in their spaces while reviewers just review it. Some teams distinguish them clearly. For instance, in some teams, you need to get in total two approvals to merge your pull request; one is from one of the code owners and the other is from any of your team members. Another use case is that you'd like certain members to have a look if time permits as an optional and additional review while the code owners have to review it.

## Notable Features
This GitHub Action enables you to:

- Auto-assign reviewers based on files changed
- Auto-assign reviewers based on the author
- Auto-assign reviewers based on groups that the author belongs to
- Auto-assign the default reviewers if no reviewers are matched to your rules
- Randomly pick reviewers from matching reviewers
- Request review only in certain conditions

###  Auto-assign reviewers based on files changed
You can define reviewers based on files using [glob](https://en.wikipedia.org/wiki/Glob_(programming)) expressions.

```yaml
files:
  '**/*.js':
    - js-lovers
```

### Auto-assign reviewers based on the author
You can specify reviewers per author.

```yaml
reviewers:
  groups:
    engineers:
      - engineer_a
      - engineer_b

  per_author:
    engineers:
      - engineers
    designer_a:
      - lead_designer
    designer_b:
      - lead_desinger
      - desinger_a
```

### Auto-assign reviewers based on groups that the author belongs to
If you enable the group assignment feature, you can request code review to all of the other members of the groups you belong to.

```yaml
reviewers:
  groups:
    js-lovers:
      - js-man
      - js-woman

options:
  enable_group_assignment: false
```

### Auto-assign the default reviewers if no reviewers are matched to your rules
You can define the default reviewers who will be assigned when no reviewers are matched to your rules.

```yaml
reviewers:
  default:
    - repository-owners
```

### Randomly pick reviewers from matching reviewers
You can randomly assign reviewers out of those who meet the conditions you set (e.g. file changes, groups, etc.).

```yaml
options:
  number_of_reviewers: 3
```

### Request review only in certain conditions
If you don't like to have the pull requests considered not yet ready reviewed, you can set `ignore_draft` and `ignored_keywords` options.

If your pull request is a draft and `ignore_draft` is `true`, review requests won't be made. The same applies if your pull request title contains any of `ignored_keywords`.

```yaml
options:
  ignore_draft: true
  ignored_keywords:
    - DO NOT REVIEW
```

## Configuration
You need to prepare two YAML files for:

- Reviewers configuration
- Workflow configuration

### Reviewers configuration
Create a configuration file where you can define code reviewers in [glob](https://en.wikipedia.org/wiki/Glob_(programming)) expressions. Internally, [minimatch](https://github.com/isaacs/minimatch) is used as a glob implementation.

The format of a configuration file is as follows:

```yaml
reviewers:
  # The default reviewers
  defaults:
    - repository-owners
    - octocat

  # Reviewer groups each of which has a list of GitHub usernames
  groups:
    repository-owners:
      - me # username
      - you # username
    core-contributors:
      - good-boy # username
      - good-girl # username
    js-lovers:
      - js-man # username
      - js-woman # username

  # Reviewers per author.
  # Keys are reviewees, each of which has an array of reviewers.
  per_author:
    engineers:
      - engineers # group
    lead_designer:
      - js-lovers # group
      - desinger_a # username
    designer_a:
      - lead_designer # username
    designer_b:
      - lead_desinger # username
      - desinger_a # username

files:
  # Keys are glob expressions.
  # You can assign groups defined above as well as GitHub usernames.
  '**':
    - repository-owners # group
  '**/*.js':
    - core-contributors # group
    - js-lovers # group
  '**/*.yml':
    - core-contributors # group
    - yamler # username
  '.github/**':
    - octopus # username
    - cat # username

options:
  ignore_draft: true
  ignored_keywords:
    - DO NOT REVIEW
  enable_group_assignment: false

  # Randomly pick reviewers up to this number.
  # Do not set this option if you'd like to assign all matching reviewers.
  number_of_reviewers: 3
```

The default configuration file location is `.github/auto_request_review.yml` but you can override it in your workflow configuration file.

### Workflow configuration
Create a workflow file in `.github/workflows` (e.g. `.github/workflows/auto_request_review.yml`):

```yaml
name: Auto Request Review

on:
  pull_request:
    types: [opened, ready_for_review, reopened]

jobs:
  auto-request-review:
    name: Auto Request Review
    runs-on: ubuntu-latest
    steps:
      - name: Request review based on files changes and/or groups the author belongs to
        uses: necojackarc/auto-request-review@v0.3.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config: .github/reviewers.yml # Config file location override
```
