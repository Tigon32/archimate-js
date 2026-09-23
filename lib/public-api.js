import Viewer from './Viewer';

const SAFE_ERROR_MESSAGES = {
  INVALID_OPTIONS: 'Viewer options are invalid.',
  MODEL_TOO_LARGE: 'The ArchiMate model exceeds the supported size limit.',
  VIEW_NOT_FOUND: 'The requested ArchiMate view was not found.',
  VIEW_NAME_AMBIGUOUS: 'The requested ArchiMate view name is ambiguous.',
  VIEWER_FAILURE: 'Unable to render the ArchiMate view.'
};
const MAX_XML_CHARACTERS = 5 * 1024 * 1024;

/**
 * Mount a read-only ArchiMate viewer using the package's supported entrypoint.
 * Import and selection errors are converted to static diagnostics so model
 * content and parser snippets are not included in messages.
 *
 * @param {{ xml: string, container: HTMLElement, viewId?: string, viewName?: string,
 *   width?: string|number, height?: string|number }} options
 * @returns {Promise<Viewer>}
 */
export async function mountViewer(options) {
  const normalized = validateMountOptions(options);
  let viewer;
  try {
    viewer = new Viewer({
      container: normalized.container,
      width: normalized.width,
      height: normalized.height
    });
  } catch {
    throw safeError('VIEWER_FAILURE');
  }

  try {
    await viewer.importXML(normalized.xml);

    if (normalized.viewId || normalized.viewName) {
      const view = resolveView(viewer.getModel(), normalized.viewId, normalized.viewName);
      await viewer.openView(view);
    }

    return viewer;
  } catch (error) {
    try {
      viewer.destroy();
    } catch {
      // Cleanup is best effort; never replace the static public diagnostic.
    }
    if (error && error.code && SAFE_ERROR_MESSAGES[error.code]) {
      throw error;
    }
    throw safeError('VIEWER_FAILURE');
  }
}

/**
 * Render one model view to an accessible SVG artifact. This API has no visible
 * user interface, but requires a browser DOM because layout and SVG geometry
 * are provided by the browser renderer.
 *
 * @param {{ xml: string, viewId?: string, viewName?: string,
 *   title?: string, description?: string, width?: string|number,
 *   height?: string|number }} options
 * @returns {Promise<string>}
 */
export async function renderViewToSvg(options) {
  if (typeof document === 'undefined' || !document.body) {
    throw safeError('VIEWER_FAILURE');
  }

  const settings = options || {};
  const host = document.createElement('div');
  const width = normalizeDimension(settings.width, '1024px');
  const height = normalizeDimension(settings.height, '768px');

  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width,
    height,
    visibility: 'hidden'
  });
  document.body.appendChild(host);

  let viewer;
  try {
    viewer = await mountViewer({
      xml: settings.xml,
      viewId: settings.viewId,
      viewName: settings.viewName,
      width,
      height,
      container: host
    });

    const { svg } = await viewer.saveSVG({
      title: settings.title,
      description: settings.description
    });

    return svg;
  } catch (error) {
    if (error && SAFE_ERROR_MESSAGES[error.code]) {
      throw error;
    }
    throw safeError('VIEWER_FAILURE');
  } finally {
    if (viewer) {
      viewer.destroy();
    }
    host.remove();
  }
}

function validateMountOptions(options) {
  if (!options || typeof options !== 'object' ||
      typeof options.xml !== 'string' || options.xml.length === 0 ||
      !options.container || options.container.nodeType !== 1 ||
      typeof options.container.appendChild !== 'function' ||
      (options.viewId && options.viewName)) {
    throw safeError('INVALID_OPTIONS');
  }
  if (options.xml.length > MAX_XML_CHARACTERS) {
    throw safeError('MODEL_TOO_LARGE');
  }

  return {
    xml: options.xml,
    container: options.container,
    viewId: normalizeViewKey(options.viewId),
    viewName: normalizeViewKey(options.viewName),
    width: normalizeDimension(options.width, '100%'),
    height: normalizeDimension(options.height, '100%')
  };
}

function normalizeDimension(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value + 'px';
  }

  if (typeof value === 'string' && /^(?:\d+(?:\.\d+)?(?:px|%)|100%)$/.test(value) &&
      parseFloat(value) > 0) {
    return value;
  }

  throw safeError('INVALID_OPTIONS');
}

function normalizeViewKey(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw safeError('INVALID_OPTIONS');
  }
  return value;
}

function resolveView(model, viewId, viewName) {
  const views = model && model.views && model.views.diagrams && model.views.diagrams.viewsList || [];
  const matches = views.filter((view) => viewId
    ? view.id === viewId
    : view.name === viewName);

  if (!matches.length) {
    throw safeError('VIEW_NOT_FOUND');
  }
  if (matches.length > 1) {
    throw safeError('VIEW_NAME_AMBIGUOUS');
  }
  return matches[0];
}

function safeError(code) {
  const error = new Error(SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.VIEWER_FAILURE);
  error.code = code;
  return error;
}
