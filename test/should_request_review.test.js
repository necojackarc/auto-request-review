'use strict';

const should_request_review = require('../src/should_request_review');
const { expect } = require('chai');

describe('should_request_review', function() {
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
