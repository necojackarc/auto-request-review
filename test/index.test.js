'use strict';

const github = require('../src/github');
const sinon = require('sinon');
const { expect } = require('chai');

// This import runs the action, so you always see the following error messages:
// > Fetching configuration file from the base branch
// > ::error::Error: Parameter token or opts.auth is required
// This is a bit annyoing but there is no bad effect, so just ignore them now.
const { run } = require('../src/index');

describe('index', function() {
  describe('run()', function() {
    beforeEach(function() {
      github.clear_cache();

      sinon.stub(github, 'get_pull_request');
      sinon.stub(github, 'fetch_config');
      sinon.stub(github, 'fetch_changed_files');
      sinon.stub(github, 'assign_reviewers');
    });

    afterEach(function() {
      github.get_pull_request.restore();
      github.fetch_config.restore();
      github.fetch_changed_files.restore();
      github.assign_reviewers.restore();
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

    it('requests reivew based on groups that authoer belongs to', async function() {
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
  });
});
