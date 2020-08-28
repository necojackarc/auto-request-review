'use strict';

const fetch_other_group_members = require('../src/fetch_other_group_members');
const { expect } = require('chai');

describe('fetch_other_group_members', function() {
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
});
