# Automated security analysis

This repository runs two automated checks:

- **CodeQL** analyzes JavaScript and TypeScript on pull requests, pushes to
  `main`, a weekly schedule, and manual dispatches. It looks for data-flow and code-pattern
  vulnerabilities in the checked-out source.
- **Dependency review** runs on pull requests and reports newly introduced
  dependencies or dependency versions with high/critical advisories or licenses
  outside the reviewed SPDX set in [`dependency-policy.md`](dependency-policy.md).
  Its failure summary identifies the changed package. It complements the human
  review process in the dependency policy.

The workflow uses the ordinary `pull_request` event, not
`pull_request_target`. It does not read repository secrets, publish packages,
write repository contents, or run release steps. CodeQL analysis still runs
for pull requests from forks, but its results are not uploaded to the
repository's code-scanning database because fork workflows receive a
read-only token. Dependency review also examines the pull request without
checking out or executing fork-controlled code.

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
