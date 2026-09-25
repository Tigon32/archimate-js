import Modeler from '../../lib/Modeler';
// @ts-ignore The compiled DTO entry exists after compile:model-dto; typecheck may run before that build.
import { DtoModelerSession, importMeffToModelDto } from '../../dist/model-dto/index.js';

Object.assign(window, { DtoSaveTest: { Modeler, DtoModelerSession, importMeffToModelDto } });
