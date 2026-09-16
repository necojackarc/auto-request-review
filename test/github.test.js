'use strict';

const core = require('@actions/core');
const fs = require('fs');
const github = require('@actions/github');
const sinon = require('sinon');
const yaml = require('yaml');
const { ContextStub } = require('./stubs/context');
const { expect } = require('chai');

const {
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
} = require('../src/github');

describe('github', function() {
  beforeEach(function() {
    clear_cache();

    const context = ContextStub.build();
    github.context = context;

    sinon.stub(core, 'getInput');
    sinon.stub(github, 'getOctokit');
  });

  afterEach(function() {
    core.getInput.restore();
    github.getOctokit.restore();
  });

  describe('get_pull_request()', function() {
    it('returns pull request data', function() {
      const pull_request = get_pull_request();

      // See the default values of ContextStub
      expect(pull_request.title).to.equal('Extract GitHub related functions into a github module');
      expect(pull_request.author).to.equal('necojackarc');
      expect(pull_request.is_draft).to.be.false;
    });
  });

  describe('get_pull_request_number()', function() {
    it('returns the number from the "pull_request" payload when present', function() {
      expect(get_pull_request_number()).to.equal(18);
    });

    it('returns the number from the "issue" payload when it is a pull request comment', function() {
      github.context = ContextStub.build({
        payload: {
          issue: { number: 42, pull_request: { url: 'https://api.github.com/repos/necojackarc/auto-request-review/pulls/42' } },
        },
      });

      expect(get_pull_request_number()).to.equal(42);
    });

    it('returns undefined when the "issue" payload is not a pull request', function() {
      github.context = ContextStub.build({
        payload: {
          issue: { number: 42 },
        },
      });

      expect(get_pull_request_number()).to.be.undefined;
    });
  });

  describe('is_reviewer_assignment_event()', function() {
    it('returns true for "pull_request"', function() {
      // See the default values of ContextStub
      expect(is_reviewer_assignment_event()).to.be.true;
    });

    it('returns true for "pull_request_target"', function() {
      github.context = ContextStub.build({ eventName: 'pull_request_target' });
      expect(is_reviewer_assignment_event()).to.be.true;
    });

    it('returns false for "pull_request_review"', function() {
      github.context = ContextStub.build({ eventName: 'pull_request_review' });
      expect(is_reviewer_assignment_event()).to.be.false;
    });

    it('returns false for "issue_comment"', function() {
      github.context = ContextStub.build({ eventName: 'issue_comment', payload: { issue: { number: 42 } } });
      expect(is_reviewer_assignment_event()).to.be.false;
    });
  });

  describe('fetch_config()', function() {
    const config_path = 'test/assets/reviewers.yml';
    const encoding = 'utf8';
    const content = fs.readFileSync(config_path, encoding);

    const octokit = {
      rest: {
        repos: {
          getContent() {
            return {
              data: {
                encoding,
                content,
              },
            };
          },
        },
      },
    };

    beforeEach(function() {
      core.getInput.withArgs('config').returns(config_path);
      github.getOctokit.returns(octokit);
    });

    it('returns a config object', async function() {
      const expected = yaml.parse(Buffer.from(content, encoding).toString());
      const actual = await fetch_config();
      expect(actual).to.deep.equal(expected);
    });
  });

  describe('fetch_changed_files()', function() {
    const stub = sinon.stub();
    const octokit = {
      rest: {
        pulls: {
          listFiles: stub,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.returns(octokit);
    });

    it('fetch changed files', async function() {
      stub.returns({
        data: [
          { filename: 'super/mario/64' },
          { filename: 'paper/mario' },
        ],
      });
      const expected = [ 'super/mario/64', 'paper/mario' ];
      const actual = await fetch_changed_files();
      expect(actual).to.deep.equal(expected);
    });

    it('fetch changed files through the last page', async function() {
      const filenames = [];
      for (let index = 0; index < 222; index += 1) {
        filenames.push(`path/to/file${index}`);
      }

      const page_size = 100;
      const filenames_in_chunks = [];
      for (let index = 0; index < filenames.length; index += page_size) {
        filenames_in_chunks.push(filenames.slice(index, index + page_size));
      }

      // Make sure filenames are correctly split into chunks
      expect(filenames_in_chunks[0].length).to.equal(100);
      expect(filenames_in_chunks[1].length).to.equal(100);
      expect(filenames_in_chunks[2].length).to.equal(22);

      stub.onCall(1).returns({ data: filenames_in_chunks[0].map((filename) => ({ filename })) });
      stub.onCall(2).returns({ data: filenames_in_chunks[1].map((filename) => ({ filename })) });
      stub.onCall(3).returns({ data: filenames_in_chunks[2].map((filename) => ({ filename })) });

      const changed_files = await fetch_changed_files();
      expect(changed_files).to.have.members(filenames);
    });
  });

  describe('assign_reviewers()', function() {
    const spy = sinon.spy();
    const octokit = {
      rest: {
        pulls: {
          requestReviewers: spy,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.resetBehavior();
      github.getOctokit.returns(octokit);
    });

    it('assigns reviewers', async function() {
      const reviewers = [ 'mario', 'princess-peach', 'team:koopa-troop' ];
      await assign_reviewers(reviewers);

      expect(spy.calledOnce).to.be.true;
      expect(spy.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        pull_number: 18,
        repo: 'auto-request-review',
        reviewers: [
          'mario',
          'princess-peach',
        ],
        team_reviewers: [
          'koopa-troop',
        ],
      });
    });
  });

  describe('list_comments()', function() {
    const stub = sinon.stub();
    const octokit = {
      rest: {
        issues: {
          listComments: stub,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.returns(octokit);
    });

    it('lists comments on the pull request', async function() {
      stub.returns({
        data: [
          { body: 'require-review: @toad', user: { login: 'princess-peach' } },
        ],
      });

      const actual = await list_comments();
      expect(actual).to.deep.equal([
        { body: 'require-review: @toad', user: { login: 'princess-peach' } },
      ]);
      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        issue_number: 18,
        page: 1,
        per_page: 100,
      });
    });

    it('lists comments through the last page', async function() {
      const comments = [];
      for (let index = 0; index < 222; index += 1) {
        comments.push({ body: `comment ${index}`, user: { login: 'mario' } });
      }

      const page_size = 100;
      stub.onCall(1).returns({ data: comments.slice(0, page_size) });
      stub.onCall(2).returns({ data: comments.slice(page_size, page_size * 2) });
      stub.onCall(3).returns({ data: comments.slice(page_size * 2) });

      const actual = await list_comments();
      expect(actual).to.have.lengthOf(222);
    });
  });

  describe('list_reviews()', function() {
    const stub = sinon.stub();
    const octokit = {
      rest: {
        pulls: {
          listReviews: stub,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.returns(octokit);
    });

    it('lists reviews on the pull request', async function() {
      stub.returns({
        data: [
          { user: { login: 'princess-peach' }, state: 'APPROVED' },
        ],
      });

      const actual = await list_reviews();
      expect(actual).to.deep.equal([
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
      ]);
      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        pull_number: 18,
        page: 1,
        per_page: 100,
      });
    });
  });

  describe('get_permission_level()', function() {
    const stub = sinon.stub();
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: stub,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.returns(octokit);
    });

    it('returns the permission level for the given user', async function() {
      stub.returns({ data: { permission: 'write' } });

      const actual = await get_permission_level('princess-peach');
      expect(actual).to.equal('write');
      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        username: 'princess-peach',
      });
    });
  });

  describe('get_pull_request_head_sha()', function() {
    it('returns the sha from the "pull_request" payload when present', async function() {
      // See the default values of ContextStub
      expect(await get_pull_request_head_sha()).to.equal('8654739977cb347ee1d2c68ccf2cc2c6007e9a0d');
    });

    it('fetches the pull request to get its head sha when the payload has no "pull_request"', async function() {
      github.context = ContextStub.build({
        payload: {
          issue: { number: 42, pull_request: { url: 'https://api.github.com/repos/necojackarc/auto-request-review/pulls/42' } },
        },
      });

      const stub = sinon.stub().returns({ data: { head: { sha: 'cafef00d' } } });
      github.getOctokit.returns({ rest: { pulls: { get: stub } } });

      expect(await get_pull_request_head_sha()).to.equal('cafef00d');
      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        pull_number: 42,
      });
    });
  });

  describe('create_check_run()', function() {
    const stub = sinon.stub();
    const octokit = {
      rest: {
        checks: {
          create: stub,
        },
      },
    };

    beforeEach(function() {
      github.getOctokit.returns(octokit);
    });

    it('creates a failing check run on the given sha', async function() {
      await create_check_run({ head_sha: 'deadbeef', conclusion: 'failure', summary: 'Missing review(s)' });

      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        name: 'require-review',
        head_sha: 'deadbeef',
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Missing required approving review(s)',
          summary: 'Missing review(s)',
        },
      });
    });

    it('creates a passing check run on the given sha', async function() {
      await create_check_run({ head_sha: 'deadbeef', conclusion: 'success', summary: 'All approved' });

      expect(stub.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        repo: 'auto-request-review',
        name: 'require-review',
        head_sha: 'deadbeef',
        status: 'completed',
        conclusion: 'success',
        output: {
          title: 'All required reviews are approved',
          summary: 'All approved',
        },
      });
    });
  });
});
