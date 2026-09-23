const FIXTURE_PATH = '../../test/fixtures/synthetic/minimal-application-view.xml';
const MAX_FIXTURE_BYTES = 256 * 1024;

const status = document.querySelector('#status');
const container = document.querySelector('#diagram');

function showFailure() {
  status.textContent = 'Could not load or render the synthetic example. Check the local build and server instructions.';
}

async function renderExample() {
  try {
    const Viewer = window.ArchimateJS && window.ArchimateJS.default;
    if (typeof Viewer !== 'function') {
      throw new Error('Viewer unavailable');
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

    const xml = await response.text();
    if (new TextEncoder().encode(xml).byteLength > MAX_FIXTURE_BYTES) {
      throw new Error('Fixture exceeds example size limit');
    }

    const viewer = new Viewer({
      container,
      width: '100%',
      height: '100%'
    });
    await viewer.importXML(xml);
    status.textContent = 'Loaded the public synthetic example.';
  } catch {
    // Keep parser, network, and model details out of the page and browser console.
    showFailure();
  }
}

renderExample();
