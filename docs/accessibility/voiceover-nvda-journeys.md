# VoiceOver and NVDA journeys for the synthetic diagram example

This guide adds platform-specific steps to the [generic manual screen-reader
procedure](manual-screen-reader-verification.md). It records how to inspect
the repository's accessible HTML outline and standalone SVG using VoiceOver on
macOS and NVDA on Windows. It does not report a screen-reader run, certify
compatibility, or promise that every browser/assistive-technology pair exposes
Graphics-ARIA roles.

**Results: Not run.** The journeys below are instructions and expected
observations only. Keep each result marked `Not run` until an operator performs
the steps on the named operating system, browser, and assistive-technology
versions.

## Public synthetic fixture and local setup

Use only the checked-in synthetic MEFF fixture
`test/fixtures/synthetic/read-only-showcase-outline-meff.xml`. Its provenance
is the repository's public, hand-authored synthetic example. Do not substitute
an imported project or customer model.

From the repository root, build the browser example and CLI, then serve the
repository on loopback:

```sh
npm ci
npm run compile
npm run compile:cli
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/examples/read-only/> in the browser specified by
the journey. Keep the server running. Wait until the page reports that the
synthetic outline loaded. If it reports an error, record that and stop the
journey. Do not open the HTML file directly through a `file:` URL.

The page contains a native HTML outline and a rendered diagram. The outline
uses headings, lists, buttons with pressed states, a search field, and a named
section; it is not an ARIA tree. Both the elements and relationships lists are
programmatically named by their visible headings. The checked-in fixture has
no groups, so there is no disclosure control to test on this page.

## VoiceOver on macOS with Safari

Record the macOS, Safari, and VoiceOver versions before starting. Turn on
VoiceOver in macOS Accessibility settings. The default VoiceOver modifier,
shown below as `VO`, is Control-Option; use the configured modifier if it was
changed. Apple documents the [VoiceOver rotor](https://support.apple.com/en-euro/guide/voiceover/mchlp2719/mac)
and [webpage landmarks](https://support.apple.com/en-gb/guide/voiceover/vo35709/mac).

### HTML outline journey

1. Reload the local example and wait for the loaded status. Use the rotor
   (`VO-U`) to inspect its **Headings** list. Move among headings with the
   arrow keys and select **Text outline**, **Elements**, and **Relationships**.
   Record the level, text, and whether the named outline section is available
   as a region. Do not require a particular spoken wording.
2. Inspect the page in reading order with `VO-Right`. Check for the main
   landmark and the navigation landmark named **Diagram navigation**. Read the
   headings, outline status, search label, elements, and relationships. Entries
   should be exposed as list items containing buttons. Element button names
   include the element type, visible name, context, and view-instance ID.
   The relationships list should be identified by its visible **Relationships**
   heading. Relationship button names include relationship type/name and
   source/target names. Record omissions, duplicate context, or confusing
   reading order.
3. Move keyboard focus to an outline button (for example, with Tab from the
   search field). With the button focused, press **ArrowDown** and **ArrowUp**
   to check that focus moves between outline buttons. Press **Return** on a
   button. Record the button's pressed state before and after activation and
   whether VoiceOver reports the change. The selected outline item should
   correspond to the selected view instance; the diagram is read-only and is
   not a keyboard-traversable canvas.
4. Focus **Search outline**, enter `platform`, and press **Return**. Check
   whether the first matching outline button receives focus and becomes
   pressed. Then search for `no synthetic match`; check whether the
   no-results status is announced. Clear the search. Record if VoiceOver's
   navigation mode intercepts any keys and the mode used for the observation.

### Standalone SVG journey

The [SVG report contract](../rendering/svg-report-contract.md) expects the
SVG root to carry `graphics-document document` with a title and description,
and named diagram objects to carry `graphics-object group` plus accessible
names. Treat those tokens as expected source semantics to inspect; they do not
predict which roles VoiceOver or Safari will expose.

Follow the [generic guide's exported-SVG procedure](manual-screen-reader-verification.md#verify-the-exported-svg),
including its exact `compile:cli` export command. It exports the same synthetic
fixture, `test/fixtures/synthetic/read-only-showcase-outline-meff.xml`, with
`--view-id view-synthetic-showcase` to
`/tmp/archimate-a11y-check/synthetic-showcase.svg`. Open that generated file in
Safari and read it as a static document. Record whether VoiceOver exposes the
SVG root's document name and description and whether meaningful objects expose
their names and roles.
Object names should provide visible type/name context; relationship names
should identify their type and endpoints. Note decorative geometry or
repeated label groups that are exposed as separate objects. SVG objects are
static and are not expected in the Tab order. If Safari or VoiceOver does not
expose a role or object as expected, record exactly what was available; do not
infer support from the SVG markup.

## NVDA on Windows with Firefox

Record the Windows, Firefox, and NVDA versions before starting. Start NVDA and
open the local example in Firefox. NVDA's default modifier is `Insert`; use
`NVDA` below for that modifier, or the configured modifier if it was changed.
The [NV Access User Guide](https://download.nvaccess.org/documentation/en/userGuide.html)
describes browse mode, single-letter navigation, and the Elements List. Use
browse mode for page reading; if a control does not accept input, use
`NVDA-Space` to switch to focus mode, then return to browse mode as needed.

### HTML outline journey

1. Reload the example and wait for the loaded status. In browse mode, press
   `h` to move among headings. Check the heading levels and names **Read-only
   ArchiMate view**, **Text outline**, **Elements**, and **Relationships**.
   Press `NVDA-F7`, choose the **Headings** list, and check whether the same
   headings are available there. Use the **Landmarks** list to inspect the
   main landmark and the **Diagram navigation** landmark. Record roles,
   names, and order without requiring exact speech.
2. Read the outline in browse order. Use `l` and `i` to move among lists and
   list items, and `b` to move among buttons. Check that element buttons
   include type, visible name, context, and view-instance ID, while
   relationship buttons include relationship type/name and source/target
   names. Both lists are programmatically named by their visible **Elements**
   and **Relationships** headings. Do not expect a tree role.
3. Focus an outline button and press **ArrowDown** and **ArrowUp** to inspect
   button-to-button focus movement. Press **Enter** on a button. Record its
   pressed state before and after activation and whether NVDA reports the
   change. The outline's selected view instance should track the activated
   button; the diagram itself is read-only and is not a keyboard-traversable
   canvas.
4. Move to **Search outline**, enter `platform`, and press **Enter**. Check
   whether the first matching outline button receives focus and becomes
   pressed. Search for `no synthetic match` and check whether the no-results
   status is announced. Clear the search and record any mode changes or keys
   that NVDA handled differently.

### Standalone SVG journey

Use the same SVG generated by the [generic guide's exported-SVG
procedure](manual-screen-reader-verification.md#verify-the-exported-svg):
its exact `compile:cli` export command uses
`test/fixtures/synthetic/read-only-showcase-outline-meff.xml` and
`--view-id view-synthetic-showcase`, and writes
`/tmp/archimate-a11y-check/synthetic-showcase.svg`. Open that file in Firefox.
In browse mode, use `g` to move to the next graphic if NVDA exposes the SVG
as a graphic; use
`NVDA-F7` to inspect available elements where useful. Record whether the SVG
is exposed as a document/graphic with a name and description, and whether
meaningful objects have useful names and roles. Relationship names should
include type and endpoint context. Note decorative geometry or repeated label
groups announced as separate objects. SVG objects are static and are not
expected in the Tab order. If Firefox or NVDA does not expose the expected
role or objects, record that observation without treating it as a universal
compatibility result.

## Results record

Create one record per browser and assistive-technology combination. Copy this
table and keep **Result** as `Not run` until the operator completes the
journey. Record only public or synthetic labels and observations.

| Field | Result |
| --- | --- |
| Result | Not run |
| Date and time, including timezone | |
| Repository commit | |
| Fixture path and provenance | `test/fixtures/synthetic/read-only-showcase-outline-meff.xml` — public, hand-authored synthetic fixture |
| Operating system and version | |
| Browser and version | |
| Assistive technology and version | |
| Relevant browser, screen-reader, or keyboard settings | |
| HTML outline expected names, roles, descriptions, and order | |
| HTML outline actual names, roles, descriptions, and order | |
| HTML keyboard movement and selected-state observation | |
| SVG expected document/object names, roles, descriptions, and order | |
| SVG actual document/object names, roles, descriptions, and order | |
| Expected/actual differences, limitations, or follow-up | |

For a difference, include the fixture path, commit, versions, reproduction
step, expected result, and observed result. Keep private data out of logs,
speech transcripts, screenshots, and reports. Exact spoken output is optional;
record it only when it contains no private information. Assess an observation
only for the recorded configuration. These journeys do not establish
compatibility for other browsers, assistive technologies, operating systems,
or Graphics-ARIA implementations, and they are not a WCAG conformance claim.

## Official references

- [Use the VoiceOver rotor on Mac](https://support.apple.com/en-euro/guide/voiceover/mchlp2719/mac) — Apple VoiceOver User Guide.
- [Use VoiceOver to navigate web pages using landmarks on Mac](https://support.apple.com/en-gb/guide/voiceover/vo35709/mac) — Apple VoiceOver User Guide.
- [NVDA User Guide](https://download.nvaccess.org/documentation/en/userGuide.html) — NV Access; the page displayed version 2026.2 when checked on 2026-09-25.

The installed versions used for a real run must be recorded in its results
record.
