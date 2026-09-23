Feature: Deterministic ArchiMate report rendering
  Public architecture reports need the same diagram source to render consistently in live HTML and Markdown image assets.

  Background:
    Given a public synthetic ArchiMate model fixture
    And a selected view id from the fixture manifest

  Scenario: Render the same view for HTML and Markdown reports
    When the selected view is rendered to SVG
    Then the SVG output is deterministic
    And the HTML report embeds that SVG without changing the diagram source
    And the Markdown image artifact is derived from that same SVG
    And no full model XML is included in logs or output metadata

  Scenario: Missing view id produces a stable diagnostic
    When a report requests a missing view id
    Then rendering fails with diagnostic code "ARCHIMATE_RENDER_VIEW_NOT_FOUND"
    And no full model XML is included in the diagnostic
