import {
  assign
} from 'min-dash';

// @ts-expect-error Legacy JavaScript boundary has no declarations yet.
import { is, getViewElement, getElementRef } from './ModelUtil';
// @ts-expect-error Legacy JavaScript boundary has no declarations yet.
import { logger } from './Logger';

type Point = { x: number; y: number };
type LabelBounds = { x: number; y: number; width: number; height: number };
type LabelElement = {
  label?: { bounds?: LabelBounds };
  labelTarget?: unknown;
};
type DiagramElement = LabelElement & {
  x: number;
  y: number;
  width: number;
  height: number;
};


export var DEFAULT_LABEL_SIZE = {
  width: 90,
  height: 20
};

export var FLOW_LABEL_INDENT = 15;

/**
 * Returns true if the given element has an external label
 *
 * @param {Shape} element
 * @return {Boolean} true if has label
 */
export function isLabelExternal(element: DiagramElement) {
  var elementRef = getElementRef(element);
  // return is(semantic, 'archimate:Group');
  return is(elementRef, 'archimate:Group');
}

/**
 * Returns true if the given element has an external label
 *
 * @param {djs.model.shape} element
 * @return {Boolean} true if has label
 */
export function hasExternalLabel(element: DiagramElement) {
  return isLabel(element.label);
}


/**
 * Get the middle of a number of waypoints
 *
 * @param  {Array<Point>} waypoints
 * @return {Point} the mid point
 */
export function getWaypointsMid(waypoints: Point[]) {
  var lengths = [],
      totalLength = 0;

  for (var i = 1; i < waypoints.length; i++) {
    var dx = waypoints[i].x - waypoints[i - 1].x,
        dy = waypoints[i].y - waypoints[i - 1].y,
        length = Math.sqrt(dx * dx + dy * dy);

    lengths.push(length);
    totalLength += length;
  }

  if (!totalLength) {
    return waypoints[0];
  }

  var halfway = totalLength / 2,
      traversed = 0;

  for (var j = 0; j < lengths.length; j++) {
    var segmentLength = lengths[j];

    if (traversed + segmentLength >= halfway) {
      var ratio = segmentLength ? (halfway - traversed) / segmentLength : 0,
          start = waypoints[j],
          end = waypoints[j + 1];

      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio
      };
    }

    traversed += segmentLength;
  }

  return waypoints[waypoints.length - 1];
}


export function getExternalLabelMid(element: DiagramElement) {

  var elementRef = getElementRef(element);      
  
  logger.log('getExternalLabelMid(element)');
  logger.log({element});

  if (is(elementRef, 'archimate:Group')) {

    return {
      x: element.x + element.width / 2,
      y: element.y + DEFAULT_LABEL_SIZE.height / 2
    };
  } else {
    return {
      x: element.x + element.width / 2,
      y: element.y + element.height + DEFAULT_LABEL_SIZE.height / 2
    };
  }
}


/**
 * Returns the bounds of an elements label, parsed from the elements or
 * generated from its bounds.
 *
 * @param {djs.model.Base} element
 */
export function getExternalLabelBounds(element: DiagramElement) {

  var mid,
      size,
      bounds,
      di = getViewElement(element),
      label = di.label;

  if (label && label.bounds) {
    bounds = label.bounds;

    size = {
      width: Math.max(DEFAULT_LABEL_SIZE.width, bounds.width),
      height: bounds.height
    };

    mid = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  } else {

    mid = getExternalLabelMid(element);

    size = DEFAULT_LABEL_SIZE;
  }

  return assign({
    x: mid.x - size.width / 2,
    y: mid.y - size.height / 2
  }, size);
}

export function isLabel(element: { bounds?: LabelBounds; labelTarget?: unknown } | undefined) {
  return element && !!element.labelTarget;
}
