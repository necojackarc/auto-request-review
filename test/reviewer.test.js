'use strict';

const {
  fetch_other_group_members,
  identify_reviewers_by_changed_files,
  identify_reviewers_by_author,
  should_request_review,
  fetch_default_reviewers,
  randomly_pick_reviewers,
} = require('../src/reviewer');
const { expect } = require('chai');
const github = require('../src/github');
const sinon = require('sinon');

describe('reviewer', function() {
  describe('fetch_other_group_members()', function() {

    const base_config = {
      reviewers: {
        groups: {
          'mario-brothers': [ 'mario', 'dr-mario', 'luigi' ],
          'mario-alike': [ 'mario', 'dr-mario', 'wario' ],
        },
      },
    };

    it('returns no members by default when "enable_group_assignment" is not supplied', function() {
      const author = 'this-does-not-matter';
      const config = {
        ...base_config,
      };

      expect(fetch_other_group_members({ author, config })).to.deep.equal([]);
    });


    it('returns no members when "enable_group_assignment" is false', function() {
      const author = 'this-does-not-matter';
      const config = {
        ...base_config,
        options: {
          enable_group_assignment: false,
        },
      };

      expect(fetch_other_group_members({ author, config })).to.deep.equal([]);
    });

    context('when "enable_group_assignment" is true', function() {
      const config = {
        ...base_config,
        options: {
          enable_group_assignment: true,
        },
      };

      it('returns all of the other members of the team if the auther belongs to one team', function() {
        const author = 'luigi';
        const other_group_members = [ 'mario', 'dr-mario' ];

        expect(fetch_other_group_members({ author, config })).to.have.members(other_group_members);
      });

      it('returns all of the other members of the teams if the author belongs to more than one team', function() {
        const author = 'mario';
        const other_group_members = [ 'dr-mario', 'luigi', 'wario' ];

        expect(fetch_other_group_members({ author, config })).to.have.members(other_group_members);
      });
    });
  });

  describe('identify_reviewers_by_changed_files()', function() {

    const config = {
      reviewers: {
        groups: {
          'backend-engineers': [ 'mario', 'luigi', 'wario', 'waluigi' ],
          'frontend-engineers': [ 'princess-peach' ],
        },
      },
      files: {
        '**/super-star': [ 'mario', 'luigi' ],
        'backend/**/*': [ 'backend-engineers' ],
        'backend/**/some-specific-file': [ 'mario', 'someone-specific' ],
        'frontend/**/*': [ 'frontend-engineers', 'toad' ],
      },
    };

    it('returns nothing when config does not have a "files" key', function() {
      const changed_files = [ 'THIS DOES NOT MATTER' ];
      expect(identify_reviewers_by_changed_files({ config: {}, changed_files })).to.deep.equal([]);
    });

    it('returns matching reviewers specified as individuals', function() {
      const changed_files = [ 'dir/super-star' ];
      expect(identify_reviewers_by_changed_files({ config, changed_files })).to.have.members([ 'mario', 'luigi' ]);
    });

    it('returns matching reviewers specified as groups', function() {
      const changed_files = [ 'backend/path/to/file' ];
      expect(identify_reviewers_by_changed_files({ config, changed_files })).to.have.members([ 'mario', 'luigi', 'wario', 'waluigi' ]);
    });

    it('works with a mix of groups and individuals', function() {
      const changed_files = [ 'frontend/path/to/file' ];
      expect(identify_reviewers_by_changed_files({ config, changed_files })).to.have.members([ 'princess-peach', 'toad' ]);
    });

    it('dedupes matching reviewers', function() {
      const changed_files = [ 'super-star', 'frontend/file', 'backend/file' ];
      expect(identify_reviewers_by_changed_files({ config, changed_files })).to.have.members([ 'mario', 'luigi', 'wario', 'waluigi', 'princess-peach', 'toad' ]);
    });

    it('excludes specified reviewers in the "excludes" option', function() {
      const changed_files = [ 'super-star', 'frontend/file', 'backend/file' ];
      const excludes = [ 'wario', 'waluigi' ];
      expect(identify_reviewers_by_changed_files({ config, changed_files, excludes })).to.have.members([ 'mario', 'luigi', 'princess-peach', 'toad' ]);
    });

    it('uses the only last matching files-changed pattern with `last_files_match_only` `true` (CODEWONERS-compatible)', function() {
      const changed_files = [ 'backend/some-specific-file' ];
      const config_with_last_files_match_only = {
        ...config,
        options: {
          last_files_match_only: true,
        },
      };
      expect(identify_reviewers_by_changed_files({ config: config_with_last_files_match_only, changed_files })).to.have.members([ 'mario', 'someone-specific' ]);
    });
  });

  describe('identify_reviewers_by_author()', function() {
    const config = {
      reviewers: {
        groups: {
          engineers: [ 'mario', 'luigi', 'wario', 'waluigi' ],
          designers: [ 'mario', 'princess-peach', 'princess-daisy' ],
        },
        per_author: {
          'engineers': [ 'engineers', 'dr-mario' ],
          'designers': [ 'designers' ],
          'yoshi': [ 'mario', 'luige' ],
          'team:koopa-troop': [ 'mario' ],
        },
      },
    };

    const stub = sinon.stub(github, 'get_team_members');
    stub.withArgs('koopa-troop').returns([ 'bowser', 'king-boo', 'goomboss' ]);

    it('returns nothing when config does not have a "per-author" key', async function() {
      const author = 'THIS DOES NOT MATTER';
      expect(await identify_reviewers_by_author({ config: { reviewers: {} }, author })).to.deep.equal([]);
    });

    it('returns nothing when the author does not exist in the "per-author" settings', async function() {
      const author = 'toad';
      expect(await identify_reviewers_by_author({ config, author })).to.deep.equal([]);
    });

    it('returns the reviewers for the author', async function() {
      const author = 'yoshi';
      expect(await identify_reviewers_by_author({ config, author })).to.have.members([ 'mario', 'luige' ]);
    });

    it('works when a author setting is specified with a group', async function() {
      const author = 'luigi';
      expect(await identify_reviewers_by_author({ config, author })).to.have.members([ 'mario', 'wario', 'waluigi', 'dr-mario' ]);
    });

    it('works when the author belongs to more than one group', async function() {
      const author = 'mario';
      expect(await identify_reviewers_by_author({ config, author })).to.have.members([ 'dr-mario', 'luigi', 'wario', 'waluigi', 'princess-peach', 'princess-daisy' ]);
    });

    it('works when gh team slug used for auther', async function() {
      const author = 'bowser';
      expect(await identify_reviewers_by_author({ config, author })).to.have.members([ 'mario' ]);
    });
  });

  describe('should_request_review()', function() {
    context('when "ignore_keywords" is not supplied', function() {
      context('given "ignore_draft" is true', function() {
        it('returns false if "is_draft" is true', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: true,
            },
          };
          expect(should_request_review({ title, is_draft: true, config })).to.be.false;
        });

        it('returns true if "is_draft" is false', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: true,
            },
          };
          expect(should_request_review({ title, is_draft: false, config })).to.be.true;
        });
      });

      context('given "ignore_draft" is false', function() {
        it('returns true if "is_draft" is true', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: false,
            },
          };
          expect(should_request_review({ title, is_draft: true, config })).to.be.true;
        });

        it('returns true if "is_draft" is false', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: false,
            },
          };
          expect(should_request_review({ title, is_draft: false, config })).to.be.true;
        });
      });
    });

    context('when "ignore_keywords" is supplied', function() {
      context('given "ignore_draft" is true', function() {
        it('returns false if "is_draft" is true', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: true,
              ignored_keywords: [],
            },
          };
          expect(should_request_review({ title, is_draft: true, config })).to.be.false;
        });

        it('returns true if "is_draft" is false', function() {
          const title = 'THIS DOES NOT MATTER';
          const config = {
            options: {
              ignore_draft: true,
              ignored_keywords: [],
            },
          };
          expect(should_request_review({ title, is_draft: false, config })).to.be.true;
        });
      });

      context('given "ignore_draft" is false', function() {
        it('returns false if the given title contains one of "ignored_keywords"', function() {
          const title = '[WIP] THIS MATTERS';
          const is_draft = true; // This doesn't matter
          const config = {
            options: {
              ignore_draft: false,
              ignored_keywords: [ 'WIP' ],
            },
          };
          expect(should_request_review({ title, is_draft, config })).to.be.false;
        });

        it('returns true if the given title does not contains any of "ignored_keywords"', function() {
          const title = 'THIS MATTERS';
          const is_draft = true; // This doesn't matter
          const config = {
            options: {
              ignore_draft: false,
              ignored_keywords: [ 'I DO NOT EXIST' ],
            },
          };
          expect(should_request_review({ title, is_draft, config })).to.be.true;
        });
      });
    });

    it('ignores a draft by default when "ignore_draft" is not supplied', function() {
      const config = { ignored_keywords: [] };

      expect(should_request_review({ title: 'THIS DOES NOT MATTER', is_draft: true, config })).to.be.false;
      expect(should_request_review({ title: 'THIS DOES NOT MATTER', is_draft: false, config })).to.be.true;
    });

    it('ignores a pull request whose title contains "DO NOT REVIEW" by default when "ignored_keywords" is not supplied', function() {
      const config = { ignore_draft: false };

      expect(should_request_review({ title: '[DO NOT REVIEW] THIS MATTERS', is_draft: false, config })).to.be.false;
      expect(should_request_review({ title: 'THIS MATTERS', is_draft: false, config })).to.be.true;
    });
  });

  describe('fetch_default_reviewers()', function() {
    it('fetches the default reviewers', function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario', 'mario-brothers' ],
          groups: {
            'mario-brothers': [ 'mario', 'luigi' ],
          },
        },
      };
      expect(fetch_default_reviewers({ config })).to.have.members([ 'dr-mario', 'mario', 'luigi' ]);
    });

    it('fetches the default reviewers exluding specified ones in the excludes option', function() {
      const config = {
        reviewers: {
          defaults: [ 'dr-mario', 'mario-brothers' ],
          groups: {
            'mario-brothers': [ 'mario', 'luigi' ],
          },
        },
      };
      expect(fetch_default_reviewers({ config, excludes: [ 'luigi' ] })).to.have.members([ 'dr-mario', 'mario' ]);
    });
  });

  describe('randomly_pick_reviewers()', function() {
    it('returns all reviewers if the number of reviewers is not set', function() {
      const reviewers = [ 'dr-mario', 'mario', 'luigi' ];
      const config = {};
      expect(randomly_pick_reviewers({ reviewers, config })).to.have.members([ 'dr-mario', 'mario', 'luigi' ]);
    });

    it('randommly pick up to the number of reviewers', function() {
      const reviewers = [ 'dr-mario', 'mario', 'luigi' ];
      const config = {
        options: {
          number_of_reviewers: 2,
        },
      };

      const randomly_picked_reviewers = randomly_pick_reviewers({ reviewers, config });
      expect([ 'dr-mario', 'mario', 'luigi' ]).to.include.members(randomly_picked_reviewers);
      expect(new Set(randomly_picked_reviewers)).to.have.lengthOf(2);
    });

    it('returns all reviewers if the number of reviewers is greater than or equal to the given reviewers', function() {
      const reviewers = [ 'dr-mario', 'mario', 'luigi' ];
      const config = {
        options: {
          number_of_reviewers: 4,
        },
      };
      expect(randomly_pick_reviewers({ reviewers, config })).to.have.members([ 'dr-mario', 'mario', 'luigi' ]);
    });
  });
});
