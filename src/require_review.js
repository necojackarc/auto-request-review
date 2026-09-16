'use strict';

const DIRECTIVE_PATTERN = /^\s*require-review:\s*@([\w-]+)/gim;
const AUTHORIZED_PERMISSIONS = [ 'admin', 'write' ];
const BINDING_REVIEW_STATES = [ 'APPROVED', 'CHANGES_REQUESTED' ];

function parse_required_reviewers(comment_body = '') {
  const usernames = [];

  for (const match of comment_body.matchAll(DIRECTIVE_PATTERN)) {
    const end_index = match.index + match[0].length;

    // A mention immediately followed by "/" is a team slug (e.g. "@org/team"), not a
    // username. Skip it rather than silently requiring a review from "org".
    if (comment_body[end_index] === '/') {
      continue;
    }

    usernames.push(match[1].toLowerCase());
  }

  return usernames;
}

function is_authorized_permission(permission) {
  return AUTHORIZED_PERMISSIONS.includes(permission);
}

function identify_approved_reviewers(reviews) {
  const latest_state_by_reviewer = new Map();

  reviews.forEach((review) => {
    // A COMMENTED or PENDING review doesn't change approval status on GitHub, so it
    // must not overwrite a prior APPROVED or CHANGES_REQUESTED for the same reviewer.
    if (!BINDING_REVIEW_STATES.includes(review.state)) {
      return;
    }

    latest_state_by_reviewer.set(review.user.login.toLowerCase(), review.state);
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
