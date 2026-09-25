# Manual screen-reader verification: SVG and view outline

This procedure records manual assistive-technology observations for the
existing read-only example and its exported SVG. It complements the automated
browser checks; those checks do not run a screen reader. For platform-specific
VoiceOver and NVDA steps, see [the tool-specific journeys](voiceover-nvda-journeys.md).
A completed checklist is evidence for only the recorded OS, browser, assistive
technology, fixture, and commit. It does not establish general browser support
or WCAG conformance.

## Public synthetic example

Use only `test/fixtures/synthetic/read-only-showcase-outline-meff.xml`. The
automated browser test identifies this as a checked-in synthetic example and
uses it for the read-only HTML outline and diagram. It also injects an escaped
synthetic label for its HTML-safety check. Do not substitute a project or
customer model.

From the repository root, build the browser bundle and start the loopback-only
example server:

```sh
npm ci
npm run compile
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/examples/read-only/> in the browser under test.
Keep the server running. The page and model are served locally; do not open the
HTML file through a `file:` URL.

## Verify the HTML outline

1. Reload the example and wait for the outline status to say that the supported
   synthetic MEFF view outline loaded. Record any load error rather than
   continuing as if the outline were complete.
2. Use the screen reader's heading navigation to find **Text outline**,
   **Elements**, and **Relationships**. Check that the example exposes the
   outline as a section with its visible heading. The example uses native
   headings, lists, and buttons; it does not implement an ARIA tree. The
   elements list is programmatically labelled by its heading. Record how the
   relationships heading and list are announced: unlike the elements list,
   the relationships list has no explicit `aria-labelledby` relationship.
3. Navigate the outline in reading order. Check that entries expose a useful
   name and element or relationship type. Element entries follow node preorder;
   relationship entries follow view order. The example adds stable
   view-instance IDs to visible labels to distinguish repeated names. Check
   that relationship entries communicate their source and target. Record
   missing, repeated, or misleading information; do not require a screen reader
   to use one exact spoken phrase.
4. Tab to an outline entry. Use the example's supported keyboard controls:
   **ArrowDown** moves focus between entries, and **Enter** activates the
   focused entry. Check that activation updates the entry's pressed state and
   that the corresponding view instance is the one selected by the outline
   bridge. Record whether the screen reader announces the state change. The
   diagram itself is intentionally non-interactive; this step does not test
   canvas keyboard traversal or focus/selection synchronization in an editor.
5. Search for `platform`, press **Enter**, and check that the matching outline
   entry receives focus and is activated. Search for `no synthetic match` and
   check that the no-results status is announced. Clear the search before
   finishing.
6. The checked-in example fixture has no groups, so it exposes no disclosure
   control; skip this step when testing that page. The automated browser test
   wraps the fixture nodes in a synthetic group to exercise the disclosure
   path. In that synthetic case, expand and collapse the native disclosure
   control and note its announced state and reading order. The implementation
   uses semantic lists and native disclosure controls rather than ARIA tree
   roles.

## Verify the exported SVG

Build the CLI and export the same selected synthetic view. Supply the path to
an already installed Chrome or Chromium executable; the project does not
download a browser.

```sh
npm run compile:cli
CHROME_BIN=/path/to/chrome node dist/cli/main.mjs export \
  test/fixtures/synthetic/read-only-showcase-outline-meff.xml \
  --view-id view-synthetic-showcase \
  --format svg \
  --output-dir /tmp/archimate-a11y-check \
  --basename synthetic-showcase
```

Open `/tmp/archimate-a11y-check/synthetic-showcase.svg` in the browser under
test. Navigate the SVG as a document/graphic using that screen reader's normal
browse or graphics navigation. Check that the export exposes a document name
and description, and that meaningful rendered objects have useful names and
roles. For relationships, check that the accessible name provides useful type
and endpoint context where present. Decorative geometry and duplicate label
groups should not be exposed as additional objects. The standalone SVG is
static and its objects are not expected in the keyboard tab order.

The HTML outline and SVG are separate representations. The current SVG root
uses `graphics-document document`; named diagram objects use
`graphics-object group`. This check does not expect SVG objects to behave like
outline buttons or update the outline's selection state. Exact speech and
available graphics navigation vary by browser and assistive technology; record
the observed output and assess whether the names, roles, order, and relationship
context are understandable.

## Record one run

Copy and complete this template for each tested browser/assistive-technology
combination. Use synthetic labels only. Do not attach a screenshot or report
containing private project material.

| Field | Result |
| --- | --- |
| Date and time (with timezone) | |
| Repository commit | |
| Fixture path and provenance | `test/fixtures/synthetic/read-only-showcase-outline-meff.xml` — checked-in synthetic fixture |
| Operating system and version | |
| Browser and version | |
| Assistive technology and version | |
| Browser/AT settings relevant to the run | |
| HTML outline: expected behavior | |
| HTML outline: observed names, roles, and navigation order | |
| HTML outline: keyboard and selection observation | |
| SVG: expected behavior | |
| SVG: observed document/object names, roles, and order | |
| Result | Pass / Fail / Not run |
| Limitations or follow-up | |

Report a failure with the public fixture path, commit, versions, reproduction
steps, expected and observed behavior, and the smallest synthetic evidence
needed to explain it. Keep exact platform speech output only when it contains
no private data. Distinguish an implementation defect from an assistive
technology/browser limitation; do not generalize beyond the tested setup.

## References and scope

- [SVG 2 Document Structure](https://www.w3.org/TR/SVG2/struct.html) defines SVG document structure and the `title` and `desc` elements.
- [Graphics ARIA 1.0](https://www.w3.org/TR/graphics-aria-1.0/) is a W3C Recommendation defining graphics document and object roles.
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/) defines roles, states, and properties used by the outline and SVG.
- [Accessible Name and Description Computation 1.2](https://www.w3.org/TR/accname-1.2/) defines accessible-name computation.
- [ARIA Authoring Practices: names and descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/) provides informative implementation guidance for accessible names.
- [SVG Accessibility API Mappings 1.0](https://www.w3.org/TR/svg-aam-1.0/) describes user-agent mappings for SVG. The current publication is a Working Draft, identifies itself as work in progress, and warns that it contains outdated information; treat it as background for this manual observation, not as a normative implementation requirement.
- The repository's [accessible outline contract](../editor/accessible-outline.md), [SVG report contract](../rendering/svg-report-contract.md), and [automated browser check](../../test/browser/accessible-outline.mts) describe the current implementation covered here.

The W3C specifications describe semantic requirements and mappings; this
manual procedure records observations and is not a certification method. The
outline and SVG checks do not complete all browser outline, editor keyboard,
focus, or selection work in [#104](https://github.com/Tigon32/archimate-js/issues/104).
