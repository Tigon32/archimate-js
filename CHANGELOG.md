# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

* `FEAT`: add deterministic versioned editor operation logs with stable
  caller-scoped operation IDs, deep-copied command payloads, atomic replay,
  and explicit undo/redo entries; no network or distributed synchronization.
* `FEAT`: add DTO-owned `create-element` and `create-relationship` commands
  with deterministic IDs, atomic validation, reviewed relationship semantics,
  one-step undo/redo, and MEFF/DTO round-trip preservation. Adapter gesture
  routing remains coordinated with #372; creation UI remains EE-M9/#351.
* `FEAT`: route public modeler optimization through one undoable DTO layout
  patch, with explicit reverse application and DTO/MEFF save consistency;
  preserve the direct legacy command-stack optimizer.
* `FEAT`: add DTO editor `move-many`, `delete-many`, and `apply-layout-patch`
  intents with atomic validation, one-step undo/redo, diagram-js batch gesture
  routing, and CanvasPort contract coverage.
* `FEAT`: add the experimental `archimate-js/modeler` subpath with a public
  `Modeler` facade, TypeScript declarations, DTO-backed lifecycle/save/events,
  adapter-level `DiagramJsCanvasPort`/`DtoModelerSession` exports, and an
  explicitly unstable diagram-js escape hatch.
* `DEPRECATION`: `DiagramJsCanvasPort`, `DtoModelerSession`, and related diagram-js adapter service/result types remain available from `archimate-js/model-dto` but are deprecated pending the EE-M4 `archimate-js/modeler` entry.

## 0.0.4

* `FEAT`: text properties supported
   * Vertical alignment
   * Horizontal alignment
   * Bold
* `CORE`: all ArchiMate elements from Strategy, Business, Application and Technolgy layers supported
* `CORE`: all ArchiMate relationships supported except Junction

## 0.0.3

Initial release

* `FEAT`: create Note
* `CORE`: ArchiMate elements supported
    * Bussiness layer : Actor, Interface, Function, Process
    * Application layer : Interface, Function, Process
    * Technology layer : Interface, Function, Process
* `CORE`: ArchiMate relationships supported
    * Association
