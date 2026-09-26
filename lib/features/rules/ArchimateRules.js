import {
  every
} from 'min-dash';

import inherits from 'inherits-browser';

import {
  is, isAny, getElementRef, VIEW, NOTE, NODE_ELEMENT, CONNECTION_RELATIONSHIP, CONNECTION_LINE } from '../../util/ModelUtil';

import { decideRelationshipSemantics } from '../../util/RelationshipSemanticsAdapter';
import { getReviewedRelationshipCandidates } from '../relationship-chooser/relationship-candidates.ts';

import { isLabel } from '../../util/LabelUtil';

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

import { ARCHIMATE_CONNECTION, ARCHIMATE_ELEMENT, ARCHIMATE_ELEMENTS, ARCHIMATE_NODE } from '../../metamodel/Concept';

/**
 * Archimate specific modeling rule
 */
export default function ArchimateRules(eventBus) {
  RuleProvider.call(this, eventBus);
}

inherits(ArchimateRules, RuleProvider);

ArchimateRules.$inject = [ 'eventBus' ];

ArchimateRules.prototype.init = function() {
  addConnectionRules(this);
  addShapeRules(this);
  addElementRules(this);
};

function addConnectionRules(rules) {
  rules.addRule('connection.create', function(context) {
    var source = context.source,
        target = context.target;

    return canConnect(source, target);
  });

  rules.addRule('connection.reconnect', function(context) {
    var connection = context.connection,
        source = context.source,
        target = context.target;

    return canConnect(source, target, connection);
  });

  rules.addRule('connection.updateWaypoints', function(context) {
    const connection = context.connection;

    return {
      type: connection.type,
      businessObject: connection.businessObject
    };
  });
}

function addShapeRules(rules) {
  rules.addRule('shape.resize', function(context) {

    var shape = context.shape,
        newBounds = context.newBounds;

    return canResize(shape, newBounds);
  });

  rules.addRule('shape.create', function(context) {
    return canCreate(
      context.shape,
      context.target,
      context.source,
      context.position
    );
  });

  rules.addRule('shape.attach', function(context) {
    return canAttach(
      context.shape,
      context.target,
      null,
      context.position
    );
  });
}

function addElementRules(rules) {
  rules.addRule('elements.create', function(context) {
    var elements = context.elements,
        position = context.position,
        target = context.target;

    return every(elements, function(element) {
      if (element.host) {
        return canAttach(element, element.host, null, position);
      }

      return canCreate(element, target, null, position);
    });
  });

  rules.addRule('elements.move', function(context) {

    var target = context.target,
        shapes = context.shapes,
        position = context.position;

    return canAttach(shapes, target, null, position) ||
           canMove(shapes, target, position);
  });

  rules.addRule('element.copy', function(context) {
    var element = context.element,
        elements = context.elements;

    return canCopy(elements, element);
  });
}

ArchimateRules.prototype.canMove = canMove;

ArchimateRules.prototype.canAttach = canAttach;

ArchimateRules.prototype.canDrop = canDrop;

ArchimateRules.prototype.canCreate = canCreate;

ArchimateRules.prototype.canReplace = canReplace;

ArchimateRules.prototype.canResize = canResize;

ArchimateRules.prototype.canCopy = canCopy;

ArchimateRules.prototype.canConnect = canConnect;

/**
 * Utility functions for rule checking
 */

function isSame(a, b) {
  return a === b;
}

function getParents(element) {

  var parents = [];

  while (element) {
    element = element.parent;

    if (element) {
      parents.push(element);
    }
  }

  return parents;
}

function isParent(possibleParent, element) {
  var allParents = getParents(element);
  return allParents.indexOf(possibleParent) !== -1;
}

function isGroup(element) {
  var elementRef = getElementRef(element);
  return is(elementRef, 'archimate:Group') && !element.labelTarget;
}

/**
 * Can an element be dropped into the target element
 *
 * @return {Boolean}
 */
function canDrop(element, target) {

  // can move labels
  if (isLabel(element) || isGroup(element)) {
    return true;
  }


  // drop elements onto board

  if (is(getElementRef(element), ARCHIMATE_ELEMENT) && is(getElementRef(target), ARCHIMATE_ELEMENTS)) {
    return true;
  }

  return false;
}

function canReplace(elements, target) {

  if (!target) {
    return false;
  }

  return true;
}


function canAttach(elements, target) {
logger.log(target);

  if (!Array.isArray(elements)) {
    elements = [ elements ];
  }

  // only (re-)attach one element at a time
  if (elements.length !== 1) {
    return false;
  }

  var element = elements[0];

  // do not attach labels
  if (isLabel(element)) {
    return false;
  }

  if (target && target.type === NOTE) {
    return false;
  }

  return 'attach';
}


function canMove(elements, target) {

  // allow default move check to start move operation
  if (!target) {
    return true;
  }

  return elements.every(function(element) {
    return canDrop(element, target);
  });
}

function canCreate(shape, target, source, position) {

  if (!target) {
    return false;
  }

  if (isLabel(shape) || isGroup(shape)) {
    return true;
  }

  if (isSame(source, target)) {
    return false;
  }

  // ensure we do not drop the element
  // into source
  if (source && isParent(source, target)) {
    return false;
  }

  return canDrop(shape, target, position);
}

function canResize(shape, newBounds) {

  
  if (isAny(shape.businessObject, [ ARCHIMATE_NODE ])) {
    return !newBounds || (newBounds.width >= 5 && newBounds.height >= 5);
  }

  if (is(shape, 'archimate:Group')) {
    return true;
  }

  if (is(shape, 'archimate:Image')) {
    return true;
  }

  return false;
}

function canCopy(elements, element) {
  return false;
}

function canConnect(source, target, connection) {
  if (!source || !target ) {
    return false;
  }

  if (source.type === VIEW || target.type === VIEW) {
    return false;
  }

  return canConnectByEndpoint(source, target, connection, endpointKind(source), endpointKind(target));
}

function canConnectByEndpoint(source, target, connection, sourceKind, targetKind) {
  if (source.businessObject.type === NODE_ELEMENT) { //is(source.businessObject, ARCHIMATE_NODE)) {
    return canConnectFromNode(source, target, connection, sourceKind, targetKind);
  }
  if (is(source.businessObject, ARCHIMATE_CONNECTION)) {
    return canConnectFromRelationship(source, target, connection, targetKind);
  }
  if (source.type === NOTE) {
    return canConnectFromNote(source, target);
  }
  return false;
}

function canConnectFromNode(source, target, connection, sourceKind, targetKind) {
  if (target.businessObject.type === NODE_ELEMENT) { //is(target.businessObject, ARCHIMATE_NODE)) {
    if (!connection) {
      var candidates = getReviewedRelationshipCandidates(source.type, target.type);
      return candidates.length === 1 ? { type: candidates[0] } : { type: CONNECTION_RELATIONSHIP };
    }

    var decision = decideRelationshipSemantics(source.type, connection.type, target.type,
      sourceKind, targetKind).decision;
    if (decision === 'allowed') return { type: connection.type };
    if (decision === 'disallowed') return false;
    return undefined;
  }
  if (is(target.businessObject, ARCHIMATE_CONNECTION)) {
    decideRelationshipSemantics(source.type, connection?.type || 'Association', target.type,
      sourceKind, 'relationship');
    return !connection || connection.type === 'Association' ? { type: 'Association' } : false;
  }
  if (target.type === NOTE) {
    return { type: CONNECTION_LINE };
  }
  return false;
}

function canConnectFromRelationship(source, target, connection, targetKind) {
  if (target.businessObject.type === NODE_ELEMENT) {
    decideRelationshipSemantics(source.type, connection?.type || 'Association', target.type,
      'relationship', targetKind);
    return !connection || connection.type === 'Association' ? { type: 'Association' } : false;
  }
  if (target.type === NOTE) {
    return { type: CONNECTION_LINE };
  }
  return false;
}

function canConnectFromNote(source, target) {
  if (!is(target.businessObject, ARCHIMATE_NODE)) {
    return false;
  }
  return { type: CONNECTION_LINE };
}

function endpointKind(element) {
  if (is(element.businessObject, ARCHIMATE_CONNECTION)) {
    return 'relationship';
  }
  if (element.type === 'Junction' || element.type === 'AndJunction' ||
      element.type === 'OrJunction' || element.type === 'And Junction' ||
      element.type === 'Or Junction') {
    return 'junction';
  }
  return 'element';
}
