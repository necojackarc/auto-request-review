'use strict';

const {
  fetch_other_group_members,
  identify_reviewers,
  should_request_review,
} = require('../src/reviewer');
const { expect } = require('chai');

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

  describe('identify_reviewers()', function() {

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
        'frontend/**/*': [ 'frontend-engineers', 'toad' ],
      },
    };

    it('returns nothing when config does not have a "files" key', function() {
      const changed_files = [ 'THIS DOES NOT MATTER' ];
      expect(identify_reviewers({ config: {}, changed_files })).to.deep.equal([]);
    });

    it('returns matching reviewers specified as indivisuals', function() {
      const changed_files = [ 'dir/super-star' ];
      expect(identify_reviewers({ config, changed_files })).to.have.members([ 'mario', 'luigi' ]);
    });

    it('returns matching reviewers specified as groups', function() {
      const changed_files = [ 'backend/path/to/file' ];
      expect(identify_reviewers({ config, changed_files })).to.have.members([ 'mario', 'luigi', 'wario', 'waluigi' ]);
    });

    it('works with a mix of groups and indivisuals', function() {
      const changed_files = [ 'frontend/path/to/file' ];
      expect(identify_reviewers({ config, changed_files })).to.have.members([ 'princess-peach', 'toad' ]);
    });

    it('dedupes matching reviewers', function() {
      const changed_files = [ 'super-star', 'frontend/file', 'backend/file' ];
      expect(identify_reviewers({ config, changed_files })).to.have.members([ 'mario', 'luigi', 'wario', 'waluigi', 'princess-peach', 'toad' ]);
    });

    it('excludes specified reviwers in the "excludes" option', function() {
      const changed_files = [ 'super-star', 'frontend/file', 'backend/file' ];
      const excludes = [ 'wario', 'waluigi' ];
      expect(identify_reviewers({ config, changed_files, excludes })).to.have.members([ 'mario', 'luigi', 'princess-peach', 'toad' ]);
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
});
