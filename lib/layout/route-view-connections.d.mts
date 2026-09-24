export function routeViewConnections(input: {
  nodes: readonly unknown[];
  connections: readonly unknown[];
}): {
  connections: Array<{ waypoints: Array<{ x: number; y: number }> }>;
  metrics: {
    nodeIntersections: number;
    sharedSegmentCount: number;
    crossingCount: number;
    unavoidableCrossings: Array<{ connectionId: string; at: { x: number; y: number } }>;
  };
};
