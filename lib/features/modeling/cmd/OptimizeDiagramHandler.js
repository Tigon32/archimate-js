/** One command for all position and waypoint changes: undo/redo stays atomic. */
import { getWaypointsMid } from '../../../util/LabelUtil';

export default function OptimizeDiagramHandler(eventBus) {
  this._eventBus = eventBus;
}

OptimizeDiagramHandler.$inject = [ 'eventBus' ];

OptimizeDiagramHandler.prototype.execute = function(context) {
  return this._apply(context, 'after');
};

OptimizeDiagramHandler.prototype.revert = function(context) {
  return this._apply(context, 'before');
};

OptimizeDiagramHandler.prototype._apply = function(context, direction) {
  var eventBus = this._eventBus;
  var changed = [];
  context.nodes.forEach(function(entry) {
    var element = entry.element;
    var desired = entry[direction];
    var baseline = entry.before;
    var businessObject = element.businessObject;
    element.x = entry.elementBefore.x + desired.x - baseline.x;
    element.y = entry.elementBefore.y + desired.y - baseline.y;
    element.width = desired.w;
    element.height = desired.h;
    businessObject.x = desired.x;
    businessObject.y = desired.y;
    businessObject.w = desired.w;
    businessObject.h = desired.h;
    changed.push(element);
    if (element.label && entry.labelBefore) {
      element.label.x = entry.labelBefore.x + desired.x - baseline.x;
      element.label.y = entry.labelBefore.y + desired.y - baseline.y;
      changed.push(element.label);
    }
  });
  context.connections.forEach(function(entry) {
    var element = entry.element;
    var points = entry[direction].map(function(point) { return { ...point }; });
    element.waypoints = points;
    element.businessObject.waypointsNode.waypoints = points.map(function(point) { return { ...point }; });
    changed.push(element);
    if (element.label && entry.labelBefore && entry.before.length && entry[direction].length) {
      var beforeMid = getWaypointsMid(entry.before);
      var desiredMid = getWaypointsMid(entry[direction]);
      element.label.x = entry.labelBefore.x + desiredMid.x - beforeMid.x;
      element.label.y = entry.labelBefore.y + desiredMid.y - beforeMid.y;
      changed.push(element.label);
    }
  });
  changed.forEach(function(element) {
    eventBus.fire('element.changed', { element: element });
  });
  return changed;
};
