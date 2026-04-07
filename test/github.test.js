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
  get_team_members,
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
    const spy = sinon.spy();
    const octokit = {
      pulls: {
        requestReviewers: spy,
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

  describe('get_team_members()', function() {
    const stub = sinon.stub();
    const octokit = {
      teams: {
        listMembersInOrg: stub,
      },
    };

    beforeEach(function() {
      github.getOctokit.resetBehavior();
      github.getOctokit.returns(octokit);
    });

    it('gets team members', async function() {
      stub.returns({
        data: [
          { login: 'bowser' },
          { login: 'king-boo' },
          { login: 'goomboss' },
        ],
      });

      const team = 'koopa-troop';
      const actual = await get_team_members(team);

      expect(stub.calledOnce).to.be.true;
      expect(stub.lastCall.args[0]).to.deep.equal({
        org: 'necojackarc',
        team_slug: 'koopa-troop',
      });
      expect(actual).to.deep.equal([ 'bowser', 'king-boo', 'goomboss' ]);
    });
  });
});
