# ADR-0006: Limit release attestation authority to a tag-only job

Date: 2026-09-24
Updated: 2026-09-24
Status: Accepted

## Context

The release-readiness job is read-only. After its checks pass, it creates one
packed npm tarball with checksums, an SPDX dependency SBOM, and a build manifest.
Issuing a GitHub build-provenance attestation requires an OIDC token and
attestation write permission. Those permissions should not be available to the
readiness job or to a manual dispatch that only inspects release evidence.

## Decision

A separate job runs only for `v*` tag pushes and depends on successful
release-readiness. It downloads the evidence artifact from the same workflow
run, verifies every recorded checksum, requires exactly one tarball, and
attests that tarball with a SHA-pinned GitHub action. Only this job receives
`contents: read`, `id-token: write`, and `attestations: write`. The workflow
does not publish the package or use repository secrets.

The readiness job remains read-only for both manual and tag triggers. Actual
attestation issuance must be verified from a reviewed tag run before #110's
attestation outcome is complete.

## Consequences

- A manual release check cannot mint a signing identity through this workflow.
- The attested subject is the same tarball retained in release evidence, after
  a checksum check in the attestation job.
- An attestation links an artifact digest to workflow provenance; it does not
  establish ArchiMate conformance or authorize an operational release.
- A tag run and independent verification remain necessary to demonstrate the
  runtime behavior. No release tag is created by this decision.

## References

- Existing release evidence: [issue #170](https://github.com/Tigon32/archimate-js/issues/170).
- Parent release controls: [issue #110](https://github.com/Tigon32/archimate-js/issues/110).
- [GitHub artifact attestation permissions and verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
- [GitHub actions/attest inputs](https://github.com/actions/attest).
