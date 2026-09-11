'use strict';

const core = require('@actions/core');
const github = require('../src/github');
const sinon = require('sinon');
const { expect } = require('chai');

const { run } = require('../src/index');

describe('index', function() {
  describe('run()', function() {
    beforeEach(function() {
      github.clear_cache();

      sinon.stub(github, 'get_pull_request');
      sinon.stub(github, 'get_pull_request_number').returns(1);
      sinon.stub(github, 'has_full_pull_request_payload').returns(true);
      sinon.stub(github, 'fetch_config');
      sinon.stub(github, 'fetch_changed_files');
      sinon.stub(github, 'assign_reviewers');
      sinon.stub(github, 'list_comments').returns([]);
      sinon.stub(github, 'list_reviews').returns([]);
      sinon.stub(github, 'get_permission_level');
    });

    afterEach(function() {
      github.get_pull_request.restore();
      github.get_pull_request_number.restore();
      github.has_full_pull_request_payload.restore();
      github.fetch_config.restore();
      github.fetch_changed_files.restore();
      github.assign_reviewers.restore();
      github.list_comments.restore();
      github.list_reviews.restore();
      github.get_permission_level.restore();
    });

    it('requests review based on files changed', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
          groups: {
            'mario-brothers': [ 'mario', 'luigi' ],
          },
        },
        files: {
          '**/*.js': [ 'mario-brothers', 'princess-peach' ],
          '**/*.rb': [ 'wario', 'waluigi' ],
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [ 'path/to/file.js' ];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;
      expect(github.assign_reviewers.lastCall.args[0]).to.have.members([ 'mario', 'princess-peach' ]);
    });

    it('requests review based on groups that author belongs to', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
          groups: {
            'mario-brothers': [ 'mario', 'dr-mario', 'luigi' ],
            'mario-alike': [ 'mario', 'dr-mario', 'wario' ],
          },
        },
        options: {
          enable_group_assignment: true,
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;
      expect(github.assign_reviewers.lastCall.args[0]).to.have.members([ 'mario', 'dr-mario' ]);
    });

    it('does not request review with "ignore_draft" true if a pull request is a draft', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
        },
        options: {
          ignore_draft: true,
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: true,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [ 'path/to/file.js' ];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.false;
    });

    it('does not request review if a pull request title contains any of "ignored_keywords"', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
        },
        options: {
          ignored_keywords: [ 'NOT NICE' ],
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: '[NOT NICE] Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [ 'path/to/file.js' ];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.false;
    });

    it('does not request review if no reviewers are matched and default reviweres are not set', async function() {
      const config = {
        reviewers: {
          groups: {
            'mario-brothers': [ 'mario', 'luigi' ],
          },
        },
        files: {
          '**/*.js': [ 'mario-brothers', 'princess-peach' ],
          '**/*.rb': [ 'wario', 'waluigi' ],
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [ 'path/to/file.py' ];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.false;
    });

    it('requests review to the default reviewers if no reviewers are matched', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario', 'mario-brothers' ],
          groups: {
            'mario-brothers': [ 'mario', 'luigi' ],
          },
        },
        files: {
          '**/*.js': [ 'mario-brothers', 'princess-peach' ],
          '**/*.rb': [ 'wario', 'waluigi' ],
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [ 'path/to/file.py' ];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;
      expect(github.assign_reviewers.lastCall.args[0]).to.have.members([ 'dr-mario', 'mario' ]);
    });

    it('requests review based on reviewers per author', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
          groups: {
            'mario-brothers': [ 'mario', 'dr-mario', 'luigi' ],
            'mario-alike': [ 'mario', 'dr-mario', 'wario' ],
          },
          per_author: {
            luigi: [ 'mario', 'waluigi' ],
          },
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;
      expect(github.assign_reviewers.lastCall.args[0]).to.have.members([ 'mario', 'waluigi' ]);
    });

    it('requests review based on reviewers per author when a group is used as an auther setting', async function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario' ],
          groups: {
            'mario-brothers': [ 'mario', 'dr-mario', 'luigi' ],
            'mario-alike': [ 'mario', 'dr-mario', 'wario' ],
          },
          per_author: {
            'mario-brothers': [ 'mario-brothers', 'waluigi' ],
          },
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;
      expect(github.assign_reviewers.lastCall.args[0]).to.have.members([ 'mario', 'dr-mario', 'waluigi' ]);
    });

    it('limits the number of reviewers based on number_of_reviewers setting', async function() {
      const config = {
        reviewers: {
          per_author: {
            luigi: [ 'dr-mario', 'mario', 'waluigi' ],
          },
        },
        options: {
          number_of_reviewers: 2,
        },
      };
      github.fetch_config.returns(config);

      const pull_request = {
        title: 'Nice Pull Request',
        is_draft: false,
        author: 'luigi',
      };
      github.get_pull_request.returns(pull_request);

      const changed_fiels = [];
      github.fetch_changed_files.returns(changed_fiels);

      await run();

      expect(github.assign_reviewers.calledOnce).to.be.true;

      const randomly_picked_reviewers = github.assign_reviewers.lastCall.args[0];
      expect([ 'dr-mario', 'mario', 'waluigi' ]).to.include.members(randomly_picked_reviewers);
      expect(new Set(randomly_picked_reviewers)).to.have.lengthOf(2);
    });

    it('terminates without fetching a config when the comment is not on a pull request', async function() {
      github.get_pull_request_number.returns(undefined);

      await run();

      expect(github.fetch_config.called).to.be.false;
      expect(github.list_comments.called).to.be.false;
    });

    it('skips auto-assignment but still enforces required reviews for a bare comment event', async function() {
      github.has_full_pull_request_payload.returns(false);
      github.list_comments.returns([
        { body: 'require-review: @princess-peach', user: { login: 'toad' } },
      ]);
      github.get_permission_level.withArgs('toad').returns('write');
      github.list_reviews.returns([]);

      sinon.stub(core, 'setFailed');

      await run();

      expect(github.fetch_config.called).to.be.false;
      expect(core.setFailed.calledOnce).to.be.true;
      expect(core.setFailed.lastCall.args[0]).to.include('princess-peach');

      core.setFailed.restore();
    });

    it('does not fail when the required reviewer has approved', async function() {
      const config = { reviewers: { defaults: [] } };
      github.fetch_config.returns(config);
      github.get_pull_request.returns({ title: 'Nice Pull Request', is_draft: false, author: 'luigi' });
      github.fetch_changed_files.returns([]);

      github.list_comments.returns([
        { body: 'require-review: @princess-peach', user: { login: 'toad' } },
      ]);
      github.get_permission_level.withArgs('toad').returns('write');
      github.list_reviews.returns([
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
      ]);

      sinon.stub(core, 'setFailed');

      await run();

      expect(core.setFailed.called).to.be.false;

      core.setFailed.restore();
    });

    it('ignores a directive from a commenter without write access', async function() {
      const config = { reviewers: { defaults: [] } };
      github.fetch_config.returns(config);
      github.get_pull_request.returns({ title: 'Nice Pull Request', is_draft: false, author: 'luigi' });
      github.fetch_changed_files.returns([]);

      github.list_comments.returns([
        { body: 'require-review: @princess-peach', user: { login: 'goomba' } },
      ]);
      github.get_permission_level.withArgs('goomba').returns('read');

      sinon.stub(core, 'setFailed');

      await run();

      expect(github.list_reviews.called).to.be.false;
      expect(core.setFailed.called).to.be.false;

      core.setFailed.restore();
    });
  });
});
