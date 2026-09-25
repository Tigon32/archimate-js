import type { SaxesTagNS } from 'saxes';

export type DataRecord = Record<string, unknown>;
export type XmlTag = SaxesTagNS;
export type XmlAttribute = { local: string; uri: string; value: string } | string;

export interface Diagnostic extends DataRecord {
  code: string;
  severity: 'warning';
  stage: 'parse';
  message: string;
}

export interface Annotation extends DataRecord {
  target: DataRecord;
  field: string;
  language: string;
  value?: string;
}

export interface NodeFrame { node: DataRecord | null }

export interface ParseResult {
  views: DataRecord | undefined;
  diagnostics: Diagnostic[];
}

export const MEFF_NAMESPACE = 'http://www.opengroup.org/xsd/archimate/3.0/';
export const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

export function asRecord(value: unknown): DataRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord : undefined;
}

export function arrayField(record: DataRecord, field: string): unknown[] {
  const value = record[field];
  return Array.isArray(value) ? value : [];
}

export function recordArrayField(record: DataRecord, field: string): DataRecord[] {
  return arrayField(record, field).filter((value): value is DataRecord =>
    value !== null && typeof value === 'object' && !Array.isArray(value));
}

export function localName(tag: XmlTag): string {
  return tag.local || tag.name.split(':').pop() || tag.name;
}

export function attribute(tag: XmlTag, name: string, namespace?: string): string | undefined {
  const direct = tag.attributes[name] as XmlAttribute | undefined;
  if (direct) return typeof direct === 'string' ? direct : direct.value;
  for (const value of Object.values(tag.attributes)) {
    if (typeof value !== 'string' && value.local === name && (!namespace || value.uri === namespace)) {
      return value.value;
    }
  }
  return undefined;
}

export function indexed(index: unknown, id: string | undefined): DataRecord | undefined {
  if (!index || id === undefined) return undefined;
  if (index instanceof Map) return asRecord(index.get(id));
  const record = asRecord(index);
  return record ? asRecord(record[id]) : undefined;
}

export function readColor(tag: XmlTag): DataRecord {
  const color: DataRecord = {
    r: Number(attribute(tag, 'r')),
    g: Number(attribute(tag, 'g')),
    b: Number(attribute(tag, 'b'))
  };
  const alpha = attribute(tag, 'a');
  if (alpha !== undefined) color.a = Number(alpha);
  return color;
}
