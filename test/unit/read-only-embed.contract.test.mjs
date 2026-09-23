import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repositoryRoot = new URL('../../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repositoryRoot), 'utf8');

describe('read-only HTML embed example', () => {
  it('uses only the documented same-origin synthetic fixture and public bundle', async () => {
    const [html, script, docs, index] = await Promise.all([
      readRepoFile('examples/read-only/index.html'),
      readRepoFile('examples/read-only/viewer.js'),
      readRepoFile('docs/rendering/read-only-html-embed.md'),
      readRepoFile('index.js')
    ]);

    expect(html).toContain('../../.ci-build/archimate-js.js');
    expect(html).toContain('pointer-events: none');
    expect(script).toContain('../../test/fixtures/synthetic/minimal-application-view.xml');
    expect(script).toContain("fixtureUrl.origin !== window.location.origin");
    expect(script).toContain('MAX_FIXTURE_BYTES');
    expect(script).toContain("response.headers.get('content-length')");
    expect(script).toContain('response.body.getReader()');
    expect(script).toContain('await reader.cancel()');
    expect(script).toContain("status.textContent = 'Loaded the public synthetic example.'");
    expect(script).toContain('api.mountViewer({');
    expect(script).toContain("viewId: 'view-synthetic-minimal'");
    expect(script).toContain('status.textContent =');
    expect(script).not.toMatch(/\b(?:eval|innerHTML)\b/);
    expect(script).not.toMatch(/console\.(?:log|error|warn)/);
    expect(script).not.toMatch(/https?:\/\//);
    expect(docs).toContain("import { mountViewer } from 'archimate-js'");
    expect(docs).toContain('test/fixtures/synthetic/minimal-application-view.xml');
    expect(docs).toContain('not an authorization or security boundary');
    expect(docs).toContain('renderViewToSvg');
    expect(docs).toContain('Derive Markdown image assets from this returned SVG');
    expect(index).toContain('mountViewer');
    expect(index).toContain('renderViewToSvg');
  });
});
