---
type: Reference
title: The Open Group ArchiMate 4 Specification
description: Authenticated HTML specification, with a synopsis of Association semantics relevant to rendering.
resource: "https://pubs.opengroup.org/architecture/archimate4-doc/index.html"
tags: [archimate, specification, relationships, association, open-group]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T23:00:47Z }
retrieved_at: 2026-09-23T23:00:47Z
authority: Normative ArchiMate language specification published by The Open Group.
license_or_terms: Licensed specification; a personal evaluation access path was used. Do not reproduce or redistribute specification text.
sources:
  - id: opengroup-archimate4-spec
    resource: "https://pubs.opengroup.org/architecture/archimate4-doc/index.html"
    title: "ArchiMate 4 Specification, Chapter 5: Relationships and Junctions"
    publisher: The Open Group
  - id: opengroup-archimate4-downloads
    resource: "https://www.opengroup.org/archimate-licensed-downloads"
    title: ArchiMate Licensed Downloads
    publisher: The Open Group
---

# Synopsis

Chapter 5 classifies relationships as structural, dependency, dynamic, and other. It states that each relationship has one source and one target concept. The Association section describes an association as either directed or undirected, which supports treating direction as an explicit relationship property in rendering and import tests.[^opengroup-archimate4-spec]

# Use in archimate-js

Keep the ArchiMate language version attached to semantic rules and tests. Apply the direction property when rendering an Association and preserve the distinction between an Association relationship and its visual arrowhead.

# Constraints

This is a language specification, not a Model Exchange XSD. It does not establish compatibility with MEFF 3.1/3.2 or certify the library. The page is behind the Open Group's authenticated publication access; the user-assisted session opened the HTML chapter after sign-in. The licensed downloads page lists access information but does not grant repository redistribution rights.[^opengroup-archimate4-downloads]

[^opengroup-archimate4-spec]: [ArchiMate 4 Specification, Chapter 5](https://pubs.opengroup.org/architecture/archimate4-doc/chap05.html), accessed 2026-09-23 after user-assisted sign-in.
[^opengroup-archimate4-downloads]: [ArchiMate Licensed Downloads](https://www.opengroup.org/archimate-licensed-downloads), retrieved 2026-09-23.
