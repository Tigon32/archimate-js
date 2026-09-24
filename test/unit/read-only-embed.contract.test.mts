// SYNTHETIC: Checks only the public read-only example and checked-in fixture.
// @ts-expect-error Node types are scoped to the CLI/browser test configuration.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repositoryRoot = new URL('../../', import.meta.url);
const readRepoFile = (path: string) => readFile(new URL(path, repositoryRoot), 'utf8');
describe('read-only HTML embed example', () => {
  it('uses only the documented same-origin synthetic fixture and public bundle', async () => {
    const [html, script, docs, index] = await Promise.all([
      readRepoFile('examples/read-only/index.html'),
      readRepoFile('examples/read-only/viewer.ts'),
      readRepoFile('docs/rendering/read-only-html-embed.md'),
      readRepoFile('index.js')
    ]);

    expect(html).toContain('../../.ci-build/archimate-js.js');
    expect(html).toContain('../../.ci-build/model-dto.js');
    expect(html).toContain('id="accessible-outline"');
    expect(html).toContain('pointer-events: none');
    expect(script).toContain('../../test/fixtures/synthetic/read-only-showcase-outline-meff.xml');
    expect(script).not.toContain('../../test/fixtures/synthetic/read-only-showcase.xml');
    expect(script).toContain('await renderOutline(window.ArchimateModelDto, xml)');
    expect(script).toContain('fixtureUrl.origin !== window.location.origin');
    expect(script).toContain('MAX_FIXTURE_BYTES');
    expect(script).toContain("response.headers.get('content-length')");
    expect(script).toContain('response.body.getReader()');
    expect(script).toContain('reader.cancel()');
    expect(script).toContain("const VIEW_ID = 'view-synthetic-showcase'");
    expect(script).toContain("status.textContent = 'Loaded the public synthetic service delivery example.'");
    expect(script).toContain('mountViewer({');
    const browserModules = script;
    expect(browserModules).toContain('textContent');
    expect(browserModules).not.toMatch(/\b(?:eval|innerHTML)\b/);
    expect(browserModules).not.toMatch(/console\.(?:log|error|warn)/);
    expect(browserModules).not.toMatch(/https?:\/\//);
    expect(script).toContain("document.createElement('ul')");
    expect(script).toContain("document.createElement('details')");
    expect(script).toContain("document.createElement('summary')");
    expect(script).toContain('Text outline unavailable for this model format.');
    expect(docs).toContain("import { mountViewer } from 'archimate-js'");
    expect(docs).toMatch(/The diagram and\s+outline both use this one model source\./);
    expect(docs).toContain('text outline');
    expect(docs).toContain('not an authorization or security boundary');
    expect(docs).toContain('renderViewToSvg');
    expect(docs).toContain('Derive Markdown image assets from this returned SVG');
    expect(index).toContain('mountViewer');
    expect(index).toContain('renderViewToSvg');
  });

});
