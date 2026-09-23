/**
 * Maximum number of nested view elements rendered from one root element.
 *
 * Keep this conservative to prevent attacker-controlled nesting from exhausting
 * the JavaScript call stack during import.
 */
export const MAX_VIEW_ELEMENT_DEPTH = 128;

/**
 * Traverse a view-element tree without recursion.
 *
 * @param {Object} rootElement
 * @param {Object} rootShape
 * @param {(element: Object, parentShape: Object) => Object} visit
 * @param {number} maxDepth
 * @returns {{ depthLimitReached: boolean, cycleDetected: boolean }}
 */
export function walkViewElementTree(rootElement, rootShape, visit, maxDepth = MAX_VIEW_ELEMENT_DEPTH) {
  const stack = [{
    element: rootElement,
    parentShape: rootShape,
    depth: 1
  }];
  const visited = new WeakSet();
  let depthLimitReached = false;
  let cycleDetected = false;

  while (stack.length) {
    const current = stack.pop();

    if (current.depth > maxDepth) {
      depthLimitReached = true;
      continue;
    }

    if (visited.has(current.element)) {
      cycleDetected = true;
      continue;
    }

    visited.add(current.element);

    const shape = visit(current.element, current.parentShape);
    const nodes = Array.isArray(current.element.nodes) ? current.element.nodes : [];

    for (let index = nodes.length - 1; index >= 0; index--) {
      stack.push({
        element: nodes[index],
        parentShape: shape,
        depth: current.depth + 1
      });
    }
  }

  return { depthLimitReached, cycleDetected };
}
