module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation
        'style',    // Formatting, missing semicolons, etc.
        'refactor', // Code restructuring without behavior change
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks
        'release',  // Release commits
      ],
    ],
    'scope-case': [0], // Disabled - allow CU-xxx and descriptive scopes like 'auth'
    'subject-case': [0], // Disabled - task IDs in subjects
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
  helpUrl: 'https://www.conventionalcommits.org/',
};
