# Contributing

Thanks for helping. The most valuable thing you can send is a **wrong or missing arrow, block or flag**, with the smallest code that reproduces it. Use the "Accuracy problem" issue template.

## Develop

```bash
npm install
npm test                       # fixture suite
node bin/cli.js main --open    # try it on any git repo (-C <path> to point elsewhere)
```

## Tests

Each folder in `test/fixtures/` is a tiny before/after project plus `expected.json`. The suite commits before → after in a temporary git repo, runs Unfold, and compares changed functions, arrows, tiers and flags by name.

- **Fixing an accuracy bug:** add the smallest reproduction to a fixture, watch the test fail, then fix.
- **Changing output on purpose:** run `UPDATE=1 npm test` and check the `expected.json` diff into your pull request.
- **Adding a language:** add it to `LANGS` in `src/extract.js`, add a fixture.

## Pull requests

- One change per pull request, with tests.
- Commit messages: imperative subject under 72 characters, body explains why.
- The core (`src/core.js` and what it uses) does no I/O: surfaces gather files and call `analyze()`.

This repository is published from an upstream source, so accepted pull requests are applied upstream and appear here on the next sync.
