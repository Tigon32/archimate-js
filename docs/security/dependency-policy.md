# Dependency and supply-chain policy

This repository accepts dependency updates through reviewed pull requests. Dependabot opens weekly updates for the root npm package, the local `archimate-font` package, and GitHub Actions. Minor and patch updates are grouped; major updates remain separate for deliberate review. No dependency update is auto-merged.

## Review and audit

For dependency changes:

1. Review the upstream changelog, package metadata, and license before accepting the update.
2. Let the pull-request dependency-review workflow identify newly introduced advisories, then run `npm audit`, `npm test`, and `npm run compile`. Review each audit finding; do not run `npm audit fix --force` as an unattended remediation.
3. Keep install-time scripts disabled in CI with `npm install --ignore-scripts`. If a future dependency requires an install script, document why it is needed and restrict approval to that package and script.
4. Update `THIRD_PARTY_NOTICES.md` when a dependency, bundled asset, license, or attribution changes.

The automated checks are described in
[`automated-analysis.md`](automated-analysis.md). They are review aids and do
not prove that a dependency or the repository is free of vulnerabilities.

## Workflow boundary

CI uses workflow-level `contents: read` permissions. Pull-request workflows do not access repository secrets, write repository contents, publish packages, or run on `pull_request_target`. Workflow actions are pinned to reviewed commit SHAs, and jobs use an explicit GitHub-hosted runner image version. Changes to permissions, action pins, runner images, triggers, or secret access require explicit review.

Do not add a privileged workflow that checks out or executes code from an untrusted pull request. Keep release credentials out of public pull-request jobs; any future release job must use a separate protected trigger and narrowly scoped environment credentials.

## Release provenance

Before the first release, commit and review the npm lockfile, install from it with `npm ci`, and produce an SPDX SBOM with `npm sbom --sbom-format=spdx > dist/sbom.spdx.json`. Retain that file with the release workflow artifacts. Record the source commit and build workflow run with the published package. Do not claim provenance or publish an operational release until the SBOM and build evidence are available.
