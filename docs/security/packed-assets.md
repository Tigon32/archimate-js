# Packed non-code asset provenance

The read-only release readiness job inspects the **actual npm tarball** after
`npm pack --ignore-scripts`. Every member other than JavaScript and TypeScript
source or declaration files must match an exact path and Git blob SHA-1 in
[`packed-assets.json`](packed-assets.json). A Git blob SHA-1 hashes
`blob <byte-count>\0<file-bytes>`; it is not the SHA-256 checksum or tag-only
attestation of the entire release archive. The inventory records provenance,
license or permission basis, a reviewer, and a review date for each source
group. Generated notation CSS/JSON and ESM marker JSON identify their generator
and inputs. The release tarball and three existing checksum entries are unchanged.

The archive parser rejects malformed entries, unsafe paths, duplicates,
symlinks, and unsupported entry types before checking the inventory. Unknown,
changed, or missing assets fail. The job prints only fixed rule IDs and counts;
it does not print member names or bytes. A new non-code asset requires an
explicit reviewed inventory entry, source/permission basis, and expected Git
blob SHA-1 before the release check can pass. A changed existing asset requires
the same review. The inventory is kept in Git but is not itself packaged.

**Current release blocker:** The `assets/archimate-4-kit/` styling source was
provided by the user for inclusion in this public repository. Its upstream
license and permission for npm redistribution are not independently verified.
`assets/design-tokens/notation.tokens.json` and
`assets/design-tokens/app.generated.css` derive from that styling source. These
groups use `USER_SUPPLIED` classification and cause the
`unverified-release-permission` hard failure even if every content hash matches.
Do not relabel them `PUBLIC` or claim MIT rights from this repository's license
alone. The maintainer must review an explicit rights basis before updating the
classification and license fields. See [ADR-0001](../adr/0001-public-clean-room-boundary.md).
The required rights evidence is tracked in [#195](https://github.com/Tigon32/archimate-js/issues/195).

This gate detects drift from reviewed source bytes and records an asserted
permission basis. It cannot prove that an upstream license applies, that an
asset was created independently, or that redistribution is lawful. Keep the
tag-only attestation authority and package dependency SBOM checks separate;
neither establishes asset source rights.
