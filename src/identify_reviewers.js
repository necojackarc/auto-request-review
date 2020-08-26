'use strict';

const minimatch = require('minimatch');

function identify_reviewers({ config, changed_files, excludes = [] }) {
  const matching_reviwers = [];

  Object.entries(config.files).forEach(([ glob_pattern, reviewers ]) => {
    if (changed_files.some((changed_file) => minimatch(changed_file, glob_pattern))) {
      matching_reviwers.push(...reviewers);
    }
  });

  // Replace groups with indivisuals
  const groups = (config.reviewers && config.reviewers.groups) || [];
  const indivisuals = matching_reviwers.flatMap((reviewer) =>
    Array.isArray(groups[reviewer]) ? groups[reviewer] : reviewer
  );

  // Depue and filter the results
  return [ ...new Set(indivisuals) ].filter((reviewer) => !excludes.includes(reviewer));
}

module.exports = identify_reviewers;
