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

The pull-request dependency review fails on newly introduced **high** or
**critical** advisories in runtime and development dependencies. It also fails
when a new dependency's detected license is outside this reviewed SPDX set:
MIT, MIT-0, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, MPL-2.0, CC0-1.0,
OFL-1.1, CC-BY-3.0, CC-BY-4.0, and BlueOak-1.0.0. This is a reviewed approval
set, not a complete inventory or a legal conclusion about compatibility.
The upstream action reports undetected licenses without failing. A second,
read-only check therefore compares added or changed lockfile entries with the
base commit and rejects missing, unsupported-expression, or unapproved license
metadata unless an exact, unexpired exception exists. Its conservative SPDX
expression support accepts the approved identifiers joined by `AND` or `OR`.
It does not re-evaluate unchanged dependencies in every pull request.
The action's job summary names the changed package and finding; the workflow
does not post a pull-request comment or need write permission.

The current lockfile also contains legacy metadata outside this set:
`argparse` has `Python-2.0`, and `type-fest` has `(MIT OR CC0-1.0)`.
`archimate-font`, `component-event`, `indexof`, and
`memorystream` have no lockfile license field. These unchanged entries are
not blanket approvals; an update to any of them is reviewed like a new entry.
GitHub's detected license may differ from lockfile metadata, so both checks
must pass for a changed package.

For a justified exception, add a file-scoped, version-specific entry to
[`dependency-exceptions.json`](dependency-exceptions.json) with its lockfile
path, exact version and license metadata (or `null` if missing), reason,
responsible human reviewer, and UTC expiry date. A human maintainer reviews
that record and the package's actual license before merging. For a detected
license rejected by the upstream action, the same reviewed PR must also add
an exact package purl to `allow-dependencies-licenses`; adding a license to
the global set would approve unrelated packages. The two exception records
must be removed or renewed after expiry. High/critical advisory exceptions
need a separately reviewed, expiring policy change; none are configured.
The current detected-license exception is limited to `pkg:npm/elkjs@0.12.0`
under its EPL-2.0 option and expires on 2026-12-25; the global approved-license
set remains unchanged.
This check is an accidental-introduction gate, not proof of license legality.

## Workflow boundary

CI uses workflow-level `contents: read` permissions. Pull-request workflows do not access repository secrets, write repository contents, publish packages, or run on `pull_request_target`. Workflow actions are pinned to reviewed commit SHAs, and jobs use an explicit GitHub-hosted runner image version. Changes to permissions, action pins, runner images, triggers, or secret access require explicit review.

Do not add a privileged workflow that checks out or executes code from an untrusted pull request. Keep release credentials out of public pull-request jobs; any future release job must use a separate protected trigger and narrowly scoped environment credentials.

## Release provenance

Before the first release, commit and review the npm lockfile and install from it with `npm ci`. The read-only release-readiness job installs the packed tarball in an isolated consumer, then generates an SPDX SBOM from the committed lockfile's production dependency graph. It retains the SBOM alongside the tarball, SHA-256 checksums, source commit, and workflow run in a downloadable artifact. This is a dependency inventory, not a file-level inventory of the tarball. A separate tag-only job is wired to checksum-verify and attest that exact tarball after readiness succeeds; only this job receives OIDC and attestation permissions. Actual issuance and `gh attestation verify` remain unverified until a reviewed tag run. Package publication and operational release authorization are separate work; see [`docs/releases.md`](../releases.md).
