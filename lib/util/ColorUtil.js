import { rgbaToHex, hexToRgba } from 'hex-and-rgba/esm';


import {
  LAYER_APPLICATION, LAYER_BUSINESS, LAYER_MOTIVATION, 
  LAYER_STRATEGY, LAYER_IMP_MIG, 
  LAYER_PHYSICAL, LAYER_TECHNOLOGY
} from '../metamodel/Concept';
import { notationFill } from '../draw/NotationAdapter.mjs';

export const COLOR_LAYER_STRATEGY = notationFill(LAYER_STRATEGY),
  COLOR_LAYER_BUSINESS = notationFill(LAYER_BUSINESS),
  COLOR_LAYER_APPLICATION = notationFill(LAYER_APPLICATION),
  COLOR_LAYER_TECHNOLOGY = notationFill(LAYER_TECHNOLOGY),
  COLOR_LAYER_PHYSICAL = notationFill(LAYER_PHYSICAL),
  COLOR_LAYER_IMP_MIG = notationFill(LAYER_IMP_MIG),
  COLOR_LAYER_MOTIVATION = notationFill(LAYER_MOTIVATION);

export const COLOR_LAYER_MAP = new Map([
  [LAYER_STRATEGY, COLOR_LAYER_STRATEGY],
  [LAYER_BUSINESS, COLOR_LAYER_BUSINESS],
  [LAYER_APPLICATION, COLOR_LAYER_APPLICATION],
  [LAYER_TECHNOLOGY, COLOR_LAYER_TECHNOLOGY],
  [LAYER_PHYSICAL, COLOR_LAYER_PHYSICAL],
  [LAYER_IMP_MIG, COLOR_LAYER_IMP_MIG],
  [LAYER_MOTIVATION, COLOR_LAYER_MOTIVATION]
])

export const BLACK_SHADOW = '#00000066', // 'rgba(0, 0, 0, 0.40)'
  DEFAULT_NOTE_COLOR = '#FFFFFF',
  DEFAULT_CONNECTION_COLOR = '#000000';

export function toHex(rgbaColor) {
  return rgbaColor && rgbaToHex(rgbaColor.r, rgbaColor.g, rgbaColor.b, rgbaColor.a/100 );
}

export function toRgba(hexColor) {
  var color = hexToRgba(hexColor);
  if (color) {
    return {r: color[0], g: color[1], b: color[2], a: color[3]*100};
  } else {
    return false
  }
}
