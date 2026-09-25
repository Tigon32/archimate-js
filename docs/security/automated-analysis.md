# Automated security analysis

This repository runs automated checks:

- **CodeQL** analyzes JavaScript and TypeScript on pull requests, pushes to
  `main`, a weekly schedule, and manual dispatches. It looks for data-flow and code-pattern
  vulnerabilities in the checked-out source.
- **Dependency review** runs on pull requests and reports newly introduced
  dependencies or dependency versions with high/critical advisories or licenses
  outside the reviewed SPDX set in [`dependency-policy.md`](dependency-policy.md).
  A lockfile-delta check also rejects changed packages with missing or
  unapproved license metadata. Failures identify the package. The checks
  complement the human review process in the dependency policy.
- **Tracked-content scan** runs in ordinary CI through `npm test` and locally
  with `npm run test:secrets` (`scripts/check-secrets.mts`). It reads only
  Git-tracked regular files, decodes them as strict UTF-8, and applies one
  deterministic scanner to text and XML content. It detects the built-in secret
  forms (GitHub token, AWS access key, private-key header) and the configurable
  organization/private-data marker rules described below. Binary or non-UTF-8
  files are skipped, and tracked symlinks, non-regular entries, and paths
  outside the checkout fail the check without being followed.

The workflow uses the ordinary `pull_request` event, not
`pull_request_target`. It does not read repository secrets, publish packages,
write repository contents, or run release steps. CodeQL analysis still runs
for pull requests from forks, but its results are not uploaded to the
repository's code-scanning database because fork workflows receive a
read-only token. The dependency-review job checks out the pull-request tree and
runs the repository's license-metadata checker with read-only permissions and
no secrets. Changes to that checker and its exception ledger require human
review; #109 owns stronger governance protection.

The tracked-content scan runs inside the ordinary test job: it reads only
the checked-out tree with the repository's read-only token, uses no
repository secrets, and makes no network requests, so it behaves identically
for fork pull requests.

## Marker rules and configuration

`docs/security/content-markers.json` holds the tracked marker rules. Each rule
is `{ "id", "pattern", "flags" }` with a lowercase kebab-case id, a regular
expression of at most 200 characters, and optional `i`/`u` flags only. The
document must declare `"version": 1`, and it fails closed as
`marker-config-invalid` when any rule is malformed, duplicated, or
uncompilable. Patterns are limited to noncapturing groups, bounded repeats
(at most 16), a small escape set, and at most 16 alternatives; unbounded
group repeats, lookarounds, backreferences, and unsafe nested repetitions are
rejected, and bounded repetition choices are capped by a deterministic path
budget of 4096 in which a repeated group multiplies its inner choices once per
maximum repetition. The tracked RFC 1918 rules match only standalone dotted
quads, so a valid prefix or suffix of an address with extra octets does not
match. The tracked configuration
is required, so missing, unreadable, or malformed content fails closed. The
tracked file intentionally contains only generic public patterns
(confidentiality classifications, private collaboration links, private
network hosts, and RFC 1918 addresses). The scanner skips the marker
configuration file itself, because that file necessarily contains the literal
rule patterns; every other tracked text file is scanned.

Organization-specific markers must not be committed to this public repository,
because the marker strings would themselves disclose private information. Point
`ARCHIMATE_CONTENT_MARKERS_FILE` at an untracked local or runner-local file to
apply them; a configured file that cannot be read fails the scan. Single
literal strings can still be supplied as comma- or newline-separated
`ARCHIMATE_SECRET_SCAN_MARKERS`. Neither marker source is printed.

## Diagnostics

Findings are redacted: the report prints a built-in or opaque marker-rule id,
the one-based index of the tracked file in the scanner's sorted path list, and
a 50-line line class such as `lines 51-100`. It never prints paths, matched
values, full lines, model
XML, or marker text. Findings are sorted by severity, rule id, file index, and
line class, so output is stable regardless of filesystem or Git path ordering.

The report separates **scanner failures** (`symlink-tracked-entry`,
`nonregular-tracked-entry`, `unreadable-or-symlink-entry`,
`path-outside-checkout`, `marker-config-invalid`), which mean the scanner could
not safely inspect content, from **manual-review findings**, which are content
detections that a human must triage. Both keep the existing exit semantics:
`npm run test:secrets` exits non-zero when either list is non-empty, exactly as
the source-policy, provenance, and tracked-path checks do.

The scan's tests use only in-memory `SYNTHETIC` canaries authored for this
public repository, and tracked test sources avoid literal private-data markers
for the same reason. A false positive should be reviewed in a PR with a
synthetic reproduction and, when the rule itself is wrong, a reviewed change to
`docs/security/content-markers.json`; do not paste the suspected value into an
issue or log. The check is intentionally a narrow accidental-leak guard. It
reduces accidental leakage but does not establish source legality, does not
prove that content is public or licensed, does not prove that no secret or
private marker remains, and does not replace human provenance review
(ADR-0001, `AGENTS.md`, PR review). GitHub repository secret scanning and push
protection are separate repository settings.

## Triage

Treat a finding as a review signal, not an automatic diagnosis. The author or
maintainer should:

1. Confirm that the reported path and data flow are reachable in the affected
   build or package.
2. Check the referenced advisory, package release notes, and supported runtime
   versions.
3. Prefer a reviewed upgrade or a narrowly scoped code fix, then run the
   relevant tests and `npm audit`.
4. Document an accepted false positive or an unavailable fix in the pull
   request, including why the finding does not apply and when it should be
   revisited.

These checks have incomplete coverage. They can miss vulnerabilities in
runtime configuration, generated or unmodeled code, transitive behavior,
build-time scripts, native tooling, and newly disclosed issues. A clean run
does **not** prove the absence of vulnerabilities, and a finding does not by
itself prove exploitability. Human review, dependency-policy checks, tests,
and release review remain required.

The workflow contract is parsed as YAML in `test:automated-analysis`. The test
allowlists the exact triggers, jobs, job permissions, action identities, and
reviewed action commits. It also rejects shell steps in this analysis workflow.
When an action is upgraded, independently verify the release tag's commit,
review the change, then update the allowlist and workflow together.
