import { logger } from "../util/Logger";
import { is } from '../util/ModelUtil';
import { ARCHIMATE_CONNECTION } from '../metamodel/Concept';
import { walkViewElementTree } from './ViewTree';

/**
 * The displayGraphicalView result.
 *
 * @typedef {Object} importArchimateDiagramResult
 *
 * @property {Array<string>} warnings
 * @property {Array<Object>} diagnostics Safe, stable diagnostics for render skips.
 */

/**
* The displayGraphicalView error.
*
* @typedef {Error} importArchimateDiagramError
*
* @property {Array<string>} warnings
* @property {Array<Object>} diagnostics Safe, stable diagnostics for render skips.
*/

/**
 * Import the definitions into a BaseViewer (inherits from diagram-js).
 *
 * Errors and warnings are reported through the specified callback.
 *
 * @param  {BaseViewer} baseViewer
 * @param  {ModdleElement<Model>} model
 * @param  {ModdleElement<View>} [view] the archimate view to be rendered (if not provided, the first one will be rendered)
 *
 * Returns {Promise<importArchimateDiagramResult, importArchimateDiagramError>}
 */
export function displayGraphicalView(baseViewer, model, view) {

  var ArchimateImporter,
      eventBus,
      translate;

  var error,
      warnings = [],
      diagnostics = [];

  function addDiagnostic(code, message) {
    diagnostics.push({ code: code, severity: 'warning', stage: 'render', message: message });
    warnings.push(message);
  }

  function renderViewElements(model, requestedView) {

    logger.log('renderViewElements');

    // get all views from the model
    var viewsList = model.views.diagrams.viewsList,
      view = requestedView;
  
    // Resolve an explicit id or accept the view object resolved by openView.
    if (typeof view === 'string') {
      var viewId = view;
      view = viewsList.find(function(candidate) {
        return candidate.id === viewId;
      });
    }

    if (view && viewsList.indexOf(view) === -1) {
      throw new Error(translate('can\'t find the requested view in model'));
    }

    // select the first view of the model if none was requested
    if (!view && viewsList && viewsList.length) {
      view = viewsList[0];
    }
  
    // no view -> nothing to display
    if (!view) {
      throw new Error(translate('no view to display'));
    }
  
    logger.log('found a view to display');
  
    var rootShape = ArchimateImporter.addRoot(view, model);
  
    if (view.viewElements) {
      var tempered = [];

      for (const viewElement of view.viewElements) {
        if (is(viewElement, ARCHIMATE_CONNECTION)) {
          tempered.push(viewElement);

        } else {
          try {
            logger.log('import view element');

            const traversal = walkViewElementTree(
              viewElement,
              rootShape,
              (node, parentShape) => {
                return ArchimateImporter.addElement(node, parentShape);
              }
            );

            if (traversal.depthLimitReached) {
              addDiagnostic('IMPORT_VIEW_DEPTH_LIMIT', 'View element nesting limit reached; remaining nested elements were skipped.');
            }

            if (traversal.cycleDetected) {
              addDiagnostic('IMPORT_VIEW_CYCLE', 'Cyclic view element nesting was detected; repeated nodes were skipped.');
            }
          } catch (e) {
            logger.warn('failed to import view element');
            addDiagnostic('IMPORT_VIEW_ELEMENT_SKIPPED', 'A view element could not be imported and was skipped.');
          }
        }
      }

      for (const connectionElement of tempered) {
        try {

          logger.log('import connection element');

          ArchimateImporter.addConnection(connectionElement);
        
        } catch (e) {
          logger.warn('failed to import connection element');
          addDiagnostic('IMPORT_VIEW_CONNECTION_SKIPPED', 'A view connection could not be imported and was skipped.');
        }
      }

    }
  
  }

  return new Promise(function(resolve, reject) {
    try {
      // init ArchimateImporter, eventBus and translate from baseViewer
      ArchimateImporter = baseViewer.get('ArchimateImporter');
      eventBus = baseViewer.get('eventBus');
      translate = baseViewer.get('translate');

      // eventBus.fire('import.render.start', { definitions: definitions });
      eventBus.fire('import.render.start', { model: model });

      //render(model, view);
      renderViewElements(model, view);

      eventBus.fire('import.render.complete', {
        error: error,
        warnings: warnings,
        diagnostics: diagnostics
      });

      return resolve({ warnings: warnings, diagnostics: diagnostics });
    } catch (e) {
      return reject(e);
    }
  });
}
