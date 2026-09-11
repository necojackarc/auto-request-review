'use strict';

const DIRECTIVE_PATTERN = /require-review:\s*@([\w-]+)/gi;
const AUTHORIZED_PERMISSIONS = [ 'admin', 'write' ];

function parse_required_reviewers(comment_body = '') {
  return [ ...comment_body.matchAll(DIRECTIVE_PATTERN) ].map((match) => match[1]);
}

function is_authorized_permission(permission) {
  return AUTHORIZED_PERMISSIONS.includes(permission);
}

function identify_approved_reviewers(reviews) {
  const latest_state_by_reviewer = new Map();

  reviews.forEach((review) => {
    latest_state_by_reviewer.set(review.user.login, review.state);
  });

  return [ ...latest_state_by_reviewer.keys() ].filter((reviewer) =>
    latest_state_by_reviewer.get(reviewer) === 'APPROVED'
  );
}

function identify_missing_reviewers({ required_reviewers, approved_reviewers }) {
  return required_reviewers.filter((reviewer) => !approved_reviewers.includes(reviewer));
}

module.exports = {
  parse_required_reviewers,
  is_authorized_permission,
  identify_approved_reviewers,
  identify_missing_reviewers,
};
