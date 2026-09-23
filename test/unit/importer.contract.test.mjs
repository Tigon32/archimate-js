import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import ArchimateModdle from '../../lib/moddle/Moddle';
import ArchimateDescriptors from '../../lib/moddle/resources/archimate.json';

describe('synthetic ArchiMate XML import contract', () => {
  it('parses the public synthetic fixture into an ArchiMate model root', async () => {
    const xml = await readFile(
      new URL('../fixtures/synthetic/minimal-application-view.xml', import.meta.url),
      'utf8'
    );
    const moddle = new ArchimateModdle({ archimate: ArchimateDescriptors });
    const { rootElement: model } = await moddle.fromXML(xml);

    expect(model).toBeDefined();
    expect(model.$type).toBe('archimate:Model');
    expect(model.id).toBe('model-synthetic-minimal');
  });
});
