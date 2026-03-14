# Automated testing on each commit

## Problem

Changes can be pushed without verification. Regressions in build or tests are only discovered manually. There is no automated gate for pull requests or main.

## Proposed solution

Add a GitHub Actions workflow that runs on each push and pull request:

- `npm run build`
- `npm test`

Integration testing for the watch flow is manual (requires Apple Silicon / MLX Whisper). Where the real backend is hard or impossible to run in CI, use a mocked backend for any future automated integration tests; document that full integration is run locally.

## Acceptance criteria

- [ ] GitHub Actions workflow runs on push and pull request to main (or default branch).
- [ ] Workflow runs `npm run build` and `npm test`.
- [ ] CI completes in a reasonable time; flaky or environment-dependent tests are isolated or skipped in CI.
- [ ] README or CONTRIBUTING mentions how to run full tests locally.
