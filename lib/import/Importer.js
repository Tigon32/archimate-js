import { logger } from "../util/Logger";
import { is } from '../util/ModelUtil';
import { ARCHIMATE_CONNECTION } from '../metamodel/Concept';


function addImportWarning(warnings, phase, element, error) {
  var warning = 'failed to import ' + phase + ' (' + getElementType(element) + ')';

  warnings.push(warning);
  logger.warn(warning, getErrorDiagnostics(error));
}

function getElementType(element) {
  return element && element.$type || 'unknown';
}

function getElementDiagnostics(element) {
  return {
    type: getElementType(element),
    idPresent: Boolean(element && element.id),
    childCount: Array.isArray(element && element.nodes) ? element.nodes.length : 0
  };
}

function getViewDiagnostics(view) {
  return {
    type: view && view.$type,
    idPresent: Boolean(view && view.id),
    elementCount: Array.isArray(view && view.viewElements) ? view.viewElements.length : 0
  };
}

function getErrorDiagnostics(error) {
  return {
    name: error && error.name,
    messagePresent: Boolean(error && error.message)
  };
}

/**
 * The displayGraphicalView result.
 *
 * @typedef {Object} importArchimateDiagramResult
 *
 * @property {Array<string>} warnings
 */

/**
* The displayGraphicalView error.
*
* @typedef {Error} importArchimateDiagramError
*
* @property {Array<string>} warnings
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
      warnings = [];

  function renderViewElements(model, viewId) {

    // get all views from the model
    var viewsList = model.views.diagrams.viewsList,
      view;

    logger.log('Rendering ArchiMate view elements', {
      viewProvided: Boolean(viewId),
      viewCount: Array.isArray(viewsList) ? viewsList.length : 0
    });
  
    // verify that model has view(s)
    if (viewId && viewsList.indexOf(viewId) === -1) {
      throw new Error(translate('can\'t find this view { viewId } in model'));
    }
  
    // select the first view of the model if viewId parameter is undefined
    if (!viewId && viewsList && viewsList.length) {
      view = viewsList[0];
    }
  
    // no view -> nothing to display
    if (!view) {
      throw new Error(translate('no view to display'));
    }
  
    logger.log('Found view to display', getViewDiagnostics(view));
  
    var rootShape = ArchimateImporter.addRoot(view, model);
  
    if (view.viewElements) {
      var tempered = [];

      for (const viewElement of view.viewElements) {
        if (is(viewElement, ARCHIMATE_CONNECTION)) {
          tempered.push(viewElement);

        } else {
          try {
            logger.log('Importing view element', getElementDiagnostics(viewElement));

            exploreNodeTree(viewElement, rootShape, rootShape);


          } catch (e) {
            addImportWarning(warnings, 'view element', viewElement, e);
          }
        }
      }

      for (const connectionElement of tempered) {
        try {

          logger.log('Importing connection element', getElementDiagnostics(connectionElement));

          ArchimateImporter.addConnection(connectionElement);
        
        } catch (e) {
          addImportWarning(warnings, 'connection element', connectionElement, e);
        }
      }

    }
  
    /*function exploreNodeTree(viewElement, parentShape) {

      var shape = ArchimateImporter.addElement(viewElement, parentShape);

      if (viewElement.nodes) {
        for (const node of viewElement.nodes) {
          exploreNodeTree(node, shape);
       }
      }
    }*/

    function exploreNodeTree(viewElement, parentShape, rootShape) {

      var shape = ArchimateImporter.addElement(viewElement, rootShape);
      shape.host = parentShape;

      if (viewElement.nodes) {
        for (const node of viewElement.nodes) {
          exploreNodeTree(node, shape, rootShape);
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
        warnings: warnings
      });

      return resolve({ warnings: warnings });
    } catch (e) {
      return reject(e);
    }
  });
}


