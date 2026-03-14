# Automated testing on each commit

## Problem

Changes can be pushed without verification. Regressions in build or tests are only discovered manually. There is no automated gate for pull requests or main.

## Proposed solution

Add a GitHub Actions workflow that runs on each push and pull request:

- `npm run build`
- `npm test`
- `npm run test:integration`

Where the real MLX Whisper backend is hard or impossible to run in CI (e.g. no Apple Silicon, no GPU), use a mocked backend so tests are stable and fast. Keep integration tests that need the real backend runnable locally only and document that.

## Acceptance criteria

- [ ] GitHub Actions workflow runs on push and pull request to main (or default branch).
- [ ] Workflow runs `npm run build`, `npm test`, and `npm run test:integration` (or equivalent with mocked backend).
- [ ] CI completes in a reasonable time; flaky or environment-dependent tests are isolated or skipped in CI.
- [ ] README or CONTRIBUTING mentions how to run full tests locally.
