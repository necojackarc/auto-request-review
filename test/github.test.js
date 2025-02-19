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
  fetch_config,
  fetch_changed_files,
  assign_reviewers,
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

  describe('fetch_config()', function() {
    const config_path = 'test/assets/reviewers.yml';
    const encoding = 'utf8';
    const content = fs.readFileSync(config_path, encoding);

    const octokit = {
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
      pulls: {
        listFiles: stub,
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
    const request_spy = sinon.spy();
    const mention_spy = sinon.spy();
    const collab_stub = sinon.stub();
    const paginate_stub = sinon.stub();
    const octokit = {
      pulls: {
        requestReviewers: request_spy,
        createReview: mention_spy,
        listRequestedReviewers: sinon.spy(),
        listReviews: sinon.spy(),
        listReviewComments: sinon.spy(),
      },
      repos: {
        checkCollaborator: collab_stub,
      },
      paginate: paginate_stub,
    };

    beforeEach(function() {
      request_spy.resetHistory();
      mention_spy.resetHistory();
      collab_stub.reset();
      paginate_stub.reset();
      github.getOctokit.resetBehavior();
      github.getOctokit.returns(octokit);
    });

    it('assigns collaborators and teams as reviewers', async function() {
      collab_stub.resolves({ status: 204 });
      const requests_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listRequestedReviewers),
        sinon.match.any
      );
      requests_call.resolves([]);
      const reviews_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listReviews),
        sinon.match.any
      );
      reviews_call.resolves([]);
      const review_comments_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listReviewComments),
        sinon.match.any
      );
      review_comments_call.resolves([]);

      const reviewers = [ 'mario', 'princess-peach', 'team:koopa-troop' ];
      await assign_reviewers(reviewers);

      expect(collab_stub.calledTwice).to.be.true;
      expect(requests_call.calledOnce).to.be.true;
      expect(reviews_call.calledOnce).to.be.true;
      expect(review_comments_call.calledOnce).to.be.true;

      expect(request_spy.calledOnce).to.be.true;
      expect(request_spy.lastCall.args[0]).to.deep.equal({
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

      expect(mention_spy.notCalled).to.be.true;
    });

    it('assigns non-collaborators as reviewers', async function() {
      collab_stub.rejects({ status: 404 });
      const requests_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listRequestedReviewers),
        sinon.match.any
      );
      requests_call.resolves([ 'mario' ]);
      const reviews_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listReviews),
        sinon.match.any
      );
      reviews_call.resolves([
        {
          body: 'Auto-requesting reviews from non-collaborators: @yoshi',
          user: { login: 'bot' },
        },
      ]);
      const review_comments_call = paginate_stub.withArgs(
        sinon.match.same(octokit.pulls.listReviewComments),
        sinon.match.any
      );
      review_comments_call.resolves([
        {
          body: 'Looks good!',
          user: { login: 'princess-peach' },
        },
      ]);

      const reviewers = [ 'mario', 'princess-peach', 'luigi', 'yoshi' ];
      await assign_reviewers(reviewers);

      expect(collab_stub.calledOnce).to.be.true;
      expect(requests_call.calledOnce).to.be.true;
      expect(reviews_call.calledOnce).to.be.true;
      expect(review_comments_call.calledOnce).to.be.true;

      expect(request_spy.notCalled).to.be.true;

      expect(mention_spy.calledOnce).to.be.true;
      expect(mention_spy.lastCall.args[0]).to.deep.equal({
        owner: 'necojackarc',
        pull_number: 18,
        repo: 'auto-request-review',
        body: 'Auto-requesting reviews from non-collaborators: @luigi',
        event: 'COMMENT',
      });
    });
  });
});
