import { ARCHIMATE_CONNECTION, ARCHIMATE_NODE } from '../../metamodel/Concept';
import { isAny, NOTE } from '../../util/ModelUtil';

function getLabelAttr(element) {
  if (isAny(element, [ ARCHIMATE_NODE, ARCHIMATE_CONNECTION ])) {
    if (element.type === NOTE) {
      return 'text';
    } else {
      return 'name';
    }
  }
}

export function getLabel(element) {
  var businessObject = element.businessObject,
      attr = getLabelAttr(businessObject);

  if (attr) {
    if (element[attr]) {
      return element[attr];
    }

    if (businessObject.label) {
      return businessObject.label;
    }

    if (businessObject.elementRef && businessObject.elementRef.name) {
      return businessObject.elementRef.name;
    }

    if (businessObject.relationshipRef && businessObject.relationshipRef.name) {
      return businessObject.relationshipRef.name;
    }

    return '';
  }

}

export function setLabel(element, text) {

  if (isAny(element.businessObject, [ ARCHIMATE_NODE ])) {
    if (element.businessObject.type === NOTE) {
      element.text = text;
      element.businessObject.label = text;
    } else {
      element.name = text;
      element.businessObject.elementRef.name = text;

    }
  }

  if (isAny(element.businessObject, [ ARCHIMATE_CONNECTION ])) {
    element.name = text;
    element.businessObject.relationshipRef.name = text;

  }
  
  return element;
}
