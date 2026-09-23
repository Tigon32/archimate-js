/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { mountViewer, renderViewToSvg } from '../../lib/public-api.js';

describe('public browser rendering API diagnostics', () => {
  it('does not reflect XML contents in invalid option diagnostics', async () => {
    const privateSentinel = 'SYNTHETIC_SECRET_SENTINEL';
    const failure = await mountViewer({
      xml: `<model>${privateSentinel}</model>`,
      container: null
    }).catch((error) => error);

    expect(failure).toMatchObject({
      code: 'INVALID_OPTIONS',
      message: 'Viewer options are invalid.'
    });
    expect(failure.message).not.toContain(privateSentinel);
  });

  it('rejects over-limit XML before initializing a viewer', async () => {
    const failure = await mountViewer({
      xml: '<model />' + ' '.repeat(5 * 1024 * 1024),
      container: document.createElement('div')
    }).catch((error) => error);

    expect(failure).toMatchObject({
      code: 'MODEL_TOO_LARGE',
      message: 'The ArchiMate model exceeds the supported size limit.'
    });
  });

  it('does not accept unsafe CSS sizing options', async () => {
    await expect(renderViewToSvg({ xml: '<model />', width: '100vw; background: url(https://invalid.test)' })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
      message: 'Viewer options are invalid.'
    });
  });
});
