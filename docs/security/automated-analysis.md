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
- **Secret scan** runs in ordinary CI through `npm test` and locally with
  `npm run test:secrets`. It checks Git-tracked UTF-8 text for GitHub token,
  AWS access-key, and private-key-header forms. Optional public or local marker
  strings can be supplied as comma- or newline-separated
  `ARCHIMATE_SECRET_SCAN_MARKERS`; their values are never printed. Binary files
  are skipped and tracked symlinks fail the check without being followed.

The secret-scan test uses only in-memory `SYNTHETIC` canaries authored for this
public repository. Failures report rule IDs and counts, without matched text or
paths. A false positive should be reviewed in a PR with a synthetic
reproduction; do not paste the suspected value into an issue or log. The check
is intentionally a narrow accidental-leak guard. It cannot establish that
source is public or licensed, or prove that no secret remains. GitHub repository
secret scanning and push protection are separate repository settings.

The workflow uses the ordinary `pull_request` event, not
`pull_request_target`. It does not read repository secrets, publish packages,
write repository contents, or run release steps. CodeQL analysis still runs
for pull requests from forks, but its results are not uploaded to the
repository's code-scanning database because fork workflows receive a
read-only token. The dependency-review job checks out the pull-request tree and
runs the repository's license-metadata checker with read-only permissions and
no secrets. Changes to that checker and its exception ledger require human
review; #109 owns stronger governance protection.

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
