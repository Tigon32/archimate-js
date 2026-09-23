Feature: Deterministic ArchiMate report rendering
  Public architecture reports use the same selected synthetic view in an HTML
  embed and in an SVG asset referenced by Markdown.

  Background:
    Given the hand-authored synthetic ArchiMate model fixture
    And view id "view-synthetic-minimal"

  Scenario: Render a selected view for HTML and Markdown reports
    When the local read-only report page loads
    Then the expected view is visible in the page
    When the selected view is rendered to SVG twice
    Then both SVG strings are identical
    And the Markdown image path refers to an asset containing that SVG string

  Scenario: Missing view id produces a stable diagnostic
    When a report requests a missing view id
    Then rendering fails with diagnostic code "VIEW_NOT_FOUND"
    And the diagnostic contains no model XML

  Scenario: Malformed model input produces a safe diagnostic
    When a report imports malformed synthetic XML
    Then rendering fails with diagnostic code "MODEL_IMPORT_FAILED"
    And the diagnostic and browser console do not contain the XML payload
