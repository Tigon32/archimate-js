---
type: Reference
title: The Open Group ArchiMate 4 Specification
description: ArchiMate 4 specification source record, prior Association synopsis, and usage restrictions.
resource: "https://pubs.opengroup.org/architecture/archimate4-doc/index.html"
tags: [archimate, specification, relationships, association, open-group]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T23:00:47Z }
retrieved_at: 2026-09-23T23:00:47Z
authority: Normative ArchiMate language specification published by The Open Group.
license_or_terms: The user-supplied HTML contains an AI-use restriction requiring prior written permission from the copyright owners. Do not reproduce or redistribute it, or derive new substantive content from it without confirming applicable rights.
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

The user supplied an HTML copy on 2026-09-24 titled *ArchiMate 4 Specification*, document C260, ISBN 1-957866-75-8, published April 2026. Its source metadata identifies the official publication site. The copy explicitly restricts use with generative AI without prior written permission from the copyright owners. This record preserves the earlier notes for provenance, but their Chapter 5 synopsis and implementation interpretation above were generated from the authenticated publication on 2026-09-23; review the rights to use those notes before relying on them or expanding them. The supplied HTML is not committed to this repository.[^opengroup-archimate4-spec]

This is a language specification, not a Model Exchange XSD. It does not establish compatibility with MEFF 3.1/3.2 or certify the library. The page is behind the Open Group's authenticated publication access; the user-assisted session opened the HTML chapter after sign-in. The licensed downloads page lists access information but does not grant repository redistribution rights.[^opengroup-archimate4-downloads]

[^opengroup-archimate4-spec]: [ArchiMate 4 Specification](https://pubs.opengroup.org/architecture/archimate4-doc/index.html), Chapter 5 accessed 2026-09-23 after user-assisted sign-in; bibliographic and usage metadata also checked against user-supplied HTML on 2026-09-24.
[^opengroup-archimate4-downloads]: [ArchiMate Licensed Downloads](https://www.opengroup.org/archimate-licensed-downloads), retrieved 2026-09-23.
