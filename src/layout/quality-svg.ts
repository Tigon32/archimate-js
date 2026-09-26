import type { ViewConnectionDto, ViewDto, ViewNodeDto } from '../model-dto/index.js';

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function flatten(nodes: readonly ViewNodeDto[]): ViewNodeDto[] {
  return nodes.flatMap((node) => [node, ...flatten(node.nodes)]);
}

function bounds(view: ViewDto): { x: number; y: number; width: number; height: number } {
  const nodes = flatten(view.nodes);
  if (!nodes.length) return { x: 0, y: 0, width: 100, height: 100 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: minX - 24, y: minY - 24, width: maxX - minX + 48, height: maxY - minY + 48 };
}

function nodeSvg(node: ViewNodeDto): string {
  const fill = node.kind === 'container' ? '#F8FAFC' : node.kind === 'label' ? '#FFFFFF' : '#E0F2FE';
  const stroke = node.kind === 'container' ? '#64748B' : '#0369A1';
  const label = node.label ? `<text x="${node.x + 8}" y="${node.y + 20}" font-size="12">${escapeText(node.label)}</text>` : '';
  return `<g data-node-id="${escapeText(node.id)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${stroke}"/>${label}${node.nodes.map(nodeSvg).join('')}</g>`;
}

function edgeSvg(edge: ViewConnectionDto): string {
  const points = edge.waypoints.map((point) => `${point.x},${point.y}`).join(' ');
  const label = edge.label ? edgeLabel(edge) : '';
  return `<g data-edge-id="${escapeText(edge.id)}"><polyline points="${points}" fill="none" stroke="#334155" stroke-width="2"/>${label}</g>`;
}

function edgeLabel(edge: ViewConnectionDto): string {
  const point = edge.waypoints[Math.floor((edge.waypoints.length - 1) / 2)];
  return `<text x="${point.x + 4}" y="${point.y - 4}" font-size="11">${escapeText(edge.label!)}</text>`;
}

export function renderLayoutQualitySvg(view: ViewDto, title: string): string {
  const box = bounds(view);
  const body = `${view.nodes.map(nodeSvg).join('')}${view.connections.map(edgeSvg).join('')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}"><title>${escapeText(title)}</title>${body}</svg>`;
}
