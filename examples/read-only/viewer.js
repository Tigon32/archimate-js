const FIXTURE_PATH = '../../test/fixtures/synthetic/read-only-showcase.xml';
const MAX_FIXTURE_BYTES = 256 * 1024;

const status = document.querySelector('#status');
const container = document.querySelector('#diagram');

function showFailure() {
  status.textContent = 'Could not load or render the synthetic example. Check the local build and server instructions.';
}

async function renderExample() {
  try {
    const api = window.ArchimateJS;
    if (!api || typeof api.mountViewer !== 'function') {
      throw new Error('Viewer API unavailable');
    }

    const fixtureUrl = new URL(FIXTURE_PATH, import.meta.url);
    if (fixtureUrl.origin !== window.location.origin) {
      throw new Error('Fixture must be same-origin');
    }

    const response = await fetch(fixtureUrl, {
      credentials: 'same-origin',
      redirect: 'error'
    });
    if (!response.ok) {
      throw new Error('Fixture request failed');
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FIXTURE_BYTES) {
      throw new Error('Fixture exceeds example size limit');
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('Fixture stream unavailable');
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > MAX_FIXTURE_BYTES) {
          throw new Error('Fixture exceeds example size limit');
        }

        chunks.push(value);
      }
    } catch (error) {
      try {
        await reader.cancel();
      } catch {
        // Cancellation is best effort; the page still reports only a generic failure.
      }
      throw error;
    }

    const fixtureBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      fixtureBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(fixtureBytes);

    await api.mountViewer({
      xml,
      viewId: 'view-synthetic-showcase',
      container,
      width: '100%',
      height: '100%'
    });
    status.textContent = 'Loaded the public synthetic service delivery example.';
  } catch {
    // Keep parser, network, and model details out of the page and browser console.
    showFailure();
  }
}

renderExample();
