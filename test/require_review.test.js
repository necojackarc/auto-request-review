'use strict';

const { expect } = require('chai');

const {
  parse_required_reviewers,
  is_authorized_permission,
  identify_approved_reviewers,
  identify_missing_reviewers,
} = require('../src/require_review');

describe('require_review', function() {
  describe('parse_required_reviewers()', function() {
    it('returns an empty array when there is no directive', function() {
      expect(parse_required_reviewers('Looks good to me!')).to.deep.equal([]);
    });

    it('returns an empty array when the comment body is undefined', function() {
      expect(parse_required_reviewers(undefined)).to.deep.equal([]);
    });

    it('parses a single directive', function() {
      expect(parse_required_reviewers('require-review: @princess-peach')).to.deep.equal([ 'princess-peach' ]);
    });

    it('parses a directive regardless of case', function() {
      expect(parse_required_reviewers('Require-Review: @princess-peach')).to.deep.equal([ 'princess-peach' ]);
    });

    it('parses multiple directives from separate lines', function() {
      const comment_body = [
        'require-review: @princess-peach',
        'require-review: @toad',
      ].join('\n');

      expect(parse_required_reviewers(comment_body)).to.deep.equal([ 'princess-peach', 'toad' ]);
    });

    it('lowercases the captured username', function() {
      expect(parse_required_reviewers('require-review: @Princess-Peach')).to.deep.equal([ 'princess-peach' ]);
    });

    it('ignores a team mention instead of requiring its slug as a user', function() {
      expect(parse_required_reviewers('require-review: @mario-brothers/core')).to.deep.equal([]);
    });

    it('does not match a directive that is not at the start of a line', function() {
      expect(parse_required_reviewers('As discussed, require-review: @princess-peach')).to.deep.equal([]);
    });

    it('matches a directive with leading whitespace', function() {
      expect(parse_required_reviewers('  require-review: @princess-peach')).to.deep.equal([ 'princess-peach' ]);
    });
  });

  describe('is_authorized_permission()', function() {
    it('returns true for "admin"', function() {
      expect(is_authorized_permission('admin')).to.be.true;
    });

    it('returns true for "write"', function() {
      expect(is_authorized_permission('write')).to.be.true;
    });

    it('returns false for "read"', function() {
      expect(is_authorized_permission('read')).to.be.false;
    });

    it('returns false for "none"', function() {
      expect(is_authorized_permission('none')).to.be.false;
    });
  });

  describe('identify_approved_reviewers()', function() {
    it('returns reviewers whose latest review is "APPROVED"', function() {
      const reviews = [
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
        { user: { login: 'toad' }, state: 'CHANGES_REQUESTED' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([ 'princess-peach' ]);
    });

    it('uses the latest review when a reviewer has reviewed more than once', function() {
      const reviews = [
        { user: { login: 'princess-peach' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([ 'princess-peach' ]);
    });

    it('drops an approval superseded by a later non-approving review', function() {
      const reviews = [
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
        { user: { login: 'princess-peach' }, state: 'CHANGES_REQUESTED' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([]);
    });

    it('does not let a later COMMENTED review undo a prior approval', function() {
      const reviews = [
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
        { user: { login: 'princess-peach' }, state: 'COMMENTED' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([ 'princess-peach' ]);
    });

    it('does not let a PENDING review undo a prior approval', function() {
      const reviews = [
        { user: { login: 'princess-peach' }, state: 'APPROVED' },
        { user: { login: 'princess-peach' }, state: 'PENDING' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([ 'princess-peach' ]);
    });

    it('normalizes the reviewer login to lowercase', function() {
      const reviews = [
        { user: { login: 'Princess-Peach' }, state: 'APPROVED' },
      ];

      expect(identify_approved_reviewers(reviews)).to.deep.equal([ 'princess-peach' ]);
    });
  });

  describe('identify_missing_reviewers()', function() {
    it('returns required reviewers who have not approved', function() {
      const missing = identify_missing_reviewers({
        required_reviewers: [ 'princess-peach', 'toad' ],
        approved_reviewers: [ 'toad' ],
      });

      expect(missing).to.deep.equal([ 'princess-peach' ]);
    });

    it('returns an empty array when all required reviewers have approved', function() {
      const missing = identify_missing_reviewers({
        required_reviewers: [ 'princess-peach' ],
        approved_reviewers: [ 'princess-peach' ],
      });

      expect(missing).to.deep.equal([]);
    });
  });
});
