import { css, symbols, tokens } from './notation.generated.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const iconAliases = {
  BusinessRole: 'Role', BusinessCollaboration: 'Collaboration',
  ApplicationCollaboration: 'Collaboration', TechnologyCollaboration: 'Collaboration',
  BusinessProcess: 'Process', ApplicationProcess: 'Process', TechnologyProcess: 'Process',
  BusinessFunction: 'Function', ApplicationFunction: 'Function', TechnologyFunction: 'Function',
  BusinessService: 'Service', ApplicationService: 'Service', TechnologyService: 'Service',
  BusinessEvent: 'Event', ApplicationEvent: 'Event', TechnologyEvent: 'Event',
  BusinessInterface: 'BusinessInterface',
  ImplementationEvent: 'Event', BusinessObject: 'BusinessObject'
};

const domainNames = {
  Strategy: 'strategy', Business: 'business', Application: 'application',
  Technology: 'technology', Physical: 'technology', Motivation: 'motivation',
  'Implementation & Migration': 'implementation', Other: 'common'
};

export function notationFill(layer, type) {
  if (type === 'Grouping') return tokens.color.grouping.fill;
  return tokens.color.domain[domainNames[layer] || 'common'].fill;
}

export function notationStroke(type) {
  return type === 'Grouping' ? tokens.color.grouping.stroke : tokens.color.stroke;
}

export function cornerRadius(type, height) {
  const family = type?.replace(/^(Business|Application|Technology|Implementation)/, '');
  return tokens.corner.rounded.includes(family) ?
    height * tokens.box.rounded_radius_ratio_of_height : 0;
}

export function chamferSize(type, height) {
  const family = type?.replace(/^(Business|Application|Technology|Implementation)/, '');
  return tokens.corner.chamfer.includes(family) ?
    height * tokens.box.chamfer_ratio_of_height : 0;
}

export function linePattern(type, strokeWidth) {
  const kind = tokens.relationship[type?.toLowerCase()]?.line;
  if (kind === 'dotted') return `${strokeWidth} ${strokeWidth}`;
  if (kind === 'dashed') return `${4 * strokeWidth} ${strokeWidth}`;
  return undefined;
}

export function scopedNotationCss() {
  return css.replaceAll(':root', '.am-diagram')
    .replaceAll('.am-icon', '.am-diagram .am-icon')
    .replaceAll('.am-rel', '.am-diagram .am-rel')
    .replaceAll('.am-swatch', '.am-diagram .am-swatch');
}

export function ensureNotation(svg) {
  if (!svg) return;
  if (svg.querySelector('defs[data-archimate-notation]')) return;
  svg.classList.add('am-diagram');
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.prepend(defs);
  }
  defs.setAttribute('data-archimate-notation', '');
  const style = document.createElementNS(SVG_NS, 'style');
  // The source sheet targets :root; embedded viewers must not style the host page.
  style.textContent = scopedNotationCss();
  defs.append(style);
  // The supplied usage comment contains CSS custom-property syntax (`--`),
  // which XML forbids inside comments. The symbol elements themselves are valid.
  const source = new DOMParser().parseFromString(
    symbols.replace(/<!--[\s\S]*?-->/g, ''), 'image/svg+xml');
  for (const symbol of source.querySelectorAll('symbol')) {
    defs.append(document.importNode(symbol, true));
  }
}

export function appendNotationIcon(parent, svg, type, width, fill) {
  if (!svg) return false;
  const symbolName = iconAliases[type] || type;
  const symbol = svg.querySelector(`symbol#am-icon-${symbolName}`);
  if (!symbol) return false;
  const icon = document.createElementNS(SVG_NS, 'svg');
  const size = Math.min(width * 0.24, 22);
  icon.setAttribute('viewBox', symbol.getAttribute('viewBox'));
  icon.setAttribute('x', String(width - size - 3));
  icon.setAttribute('y', '2');
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size * 0.8));
  icon.setAttribute('class', 'am-icon');
  icon.setAttribute('style', `--am-fill:${fill};--am-stroke:${tokens.color.stroke}`);
  for (const child of symbol.children) icon.append(document.importNode(child, true));
  parent.append(icon);
  return true;
}
