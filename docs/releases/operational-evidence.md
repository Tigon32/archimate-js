# Operational interoperability evidence

Status: BLOCKED

Stable operational releases require a reviewed evidence record for each item
below. Link only synthetic or explicitly redistributable public fixtures and
public CI artifacts. Do not attach private architecture models or exports.

| Area | Evidence required | Status |
|---|---|---|
| Import | Synthetic/public exchange file imported with explicit diagnostics; record unsupported/partial cases. | Not demonstrated |
| Export | Imported model exported and checked for retained content and stable serialization. | Not demonstrated |
| Render | Selected imported view rendered to SVG and checked for stable structure/labels. | Synthetic browser smoke only; interoperability input not demonstrated |
| Archi comparison | Same synthetic/public file imported and exported by Archi; compare documented content-level outcomes. | Not demonstrated |
| Standards boundary | State the exact ArchiMate/MEFF scope and distinguish tested subset from conformance. | Partial; see standards profiles |

Change `Status: BLOCKED` only after every row has a durable public evidence link,
reviewed scope, and limitation notes. The release gate deliberately rejects a
stable version while this status remains blocked. A green test run by itself
does not establish interoperability or conformance.
