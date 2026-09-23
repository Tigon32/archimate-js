# Security policy

## Supported versions

This fork is not yet production-ready. Until an operational release is declared, treat all versions as experimental.

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub's private vulnerability reporting if enabled, or by opening a minimal public issue that does not include exploit details or sensitive data.

Do not include real architecture models, private XML exports, credentials, hostnames, IP addresses, access-control data, or customer context in a report.

## Sensitive-data policy

Architecture models often contain sensitive information. The project must not log complete model XML, parsed models, payloads, or generated architecture views by default.

Allowed diagnostics should be:

- opt-in;
- redacted by default;
- structured enough to debug without exposing model content;
- covered by tests when feasible.

## Public PR safety

- Do not use `pull_request_target` to execute untrusted contributor code.
- Keep workflow permissions least-privilege.
- Do not expose repository secrets to public pull-request jobs.
- Review dependency and generated-file changes manually.
