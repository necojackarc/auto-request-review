'use strict';

const identify_reviewers = require('../src/identify_reviewers');
const { expect } = require('chai');

describe('identify_reviewers', function() {
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
});
