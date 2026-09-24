// @ts-expect-error Legacy Modeler is awaiting migration to TypeScript.
import Modeler from '../../lib/Modeler.js';
import { DtoModelerSession, importMeffToModelDto } from '../../dist/model-dto/index.js';

Object.assign(window, { DtoSaveTest: { Modeler, DtoModelerSession, importMeffToModelDto } });
