/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {TAXONOMY} from './taxonomy';

type SimpleBaseVariant = 'light' | 'dark';
export type PublicElementType = 'geometry' | 'label';
type BackwardCompatibleStyler = 'color'|'strokeWeight'|'textStrokeWeight'|'pinFillColor';
export type PublicStyler = 'visible'|'fillColor'|'fillOpacity'|'strokeColor'|'strokeOpacity'|'strokeWidth'|'pinContainerColor'|'pinOutlineColor'|'pinGlyphColor'|'iconColor'|'textFillColor'|'textFillOpacity'|'textStrokeColor'|'textStrokeOpacity'|'textStrokeWidth'|BackwardCompatibleStyler;
export type PublicSingleStylerValue = string | number | boolean;
export type PublicStylerValue = {
  [key in PublicStyler]?: PublicStylerOrZoomValue<PublicSingleStylerValue>;
};
export interface PublicZoomValue<T> {
  [key: string]: T;
}
export type PublicStylerOrZoomValue<T> = T | PublicZoomValue<T>;
export interface PublicStylerFeatureMetadata {
  id: string; // Feature type
}
export type PublicElementStyler = {
  [key in PublicElementType]?: PublicStylerValue;
};
export type PublicStylerConfig = PublicStylerFeatureMetadata &
  PublicElementStyler;
export interface PublicFeatureElementStyler {
  feature: string;
  element: PublicElementType;
  styler: PublicStyler;
  value: PublicStylerOrZoomValue<string | number | boolean>;
}
export interface PublicTopLevelStyleData {
  monochrome?: boolean | string;
  variant?: SimpleBaseVariant;
  backgroundColor?: string;
}
export interface PublicJSONModel extends PublicTopLevelStyleData {
  styles?: PublicStylerConfig[];
}
export enum ValidationErrorType {
  ALPHA_KEYZOOM_COLOR_KEYZOOM_MISMATCH = 'ALPHA_KEYZOOM_COLOR_KEYZOOM_MISMATCH',
  ALPHA_KEYZOOM_COLOR_SCALAR = 'ALPHA_KEYZOOM_COLOR_SCALAR',
  DEPRECATED_STYLER = 'DEPRECATED_STYLER',
  INVALID_JSON = 'INVALID_JSON',
  INVALID_TOP_LEVEL_KEY = 'INVALID_TOP_LEVEL_KEY',
  INVALID_TOP_LEVEL_VALUE = 'INVALID_TOP_LEVEL_VALUE',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  FEATURE_NOT_FOUND = 'FEATURE_NOT_FOUND',
  MISSING_ZOOM_ZERO = 'MISSING_ZOOM_ZERO',
  STYLER_KEYS_INVALID = 'STYLER_KEYS_INVALID',
  STYLER_NOT_FOUND = 'STYLER_NOT_FOUND',
  STYLER_VALUE_NOT_FOUND = 'STYLER_VALUE_NOT_FOUND',
  STYLER_VALUE_INVALID = 'STYLER_VALUE_INVALID',
  UNMATCHED_ALPHA_KEY = 'UNMATCHED_ALPHA_KEY',
  ZOOM_VALUE_INVALID = 'ZOOM_VALUE_INVALID',
}
export enum ValidationSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
}
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  severity: ValidationSeverity;
  invalidKey?: string;
  featureId?: string;
  element?: string;
  styler?: string;
  value?: any;
  zoom?: number;
  deprecatedStyler?: string;
  newStyler?: string;
}
export type ValidatorFn = (value: PublicSingleStylerValue) => boolean;
export interface FeatureElementStylerMap {
  [key: string]: {
    [key in PublicElementType]?: {
      [key in PublicStyler]?: ValidatorFn;
    };
  };
}
export const ALPHA_TO_COLOR_MAP = new Map<PublicStyler, PublicStyler>([
  ['fillOpacity', 'fillColor'],
  ['strokeOpacity', 'strokeColor'],
  ['textFillOpacity', 'textFillColor'],
  ['textStrokeOpacity', 'textStrokeColor'],
]);
export const COLOR_TO_ALPHA_MAP = new Map<PublicStyler, PublicStyler>([
  ['fillColor', 'fillOpacity'],
  ['strokeColor', 'strokeOpacity'],
  ['textFillColor', 'textFillOpacity'],
  ['textStrokeColor', 'textStrokeOpacity'],
]);
export const ALPHA_KEYS = [...ALPHA_TO_COLOR_MAP.keys()];
export function isKeyzoom<T>(
  stylerValue: PublicStylerOrZoomValue<T>,
): stylerValue is PublicZoomValue<T> {
  return typeof stylerValue === 'object';
}
const DELIMITER = '|';
function elementStylerKey(element: PublicElementType, styler: PublicStyler) {
  return `${element}${DELIMITER}${styler}`;
}
function internalElementStylerKey(
  internalElement: string,
  internalStyler: string,
) {
  return `${internalElement}${DELIMITER}${internalStyler}`;
}
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;
export const COLOR_REGEX = /^\#[0-9a-fA-F]{6}$/;
export const MIN_WIDTH = 0;
export const MAX_WIDTH = 8;
export const WIDTH_MULTIPLE_OF = 0.125;
export const MIN_ALPHA = 0;
export const MAX_ALPHA = 1;
export const ALPHA_MULTIPLE_OF = 0.01;
export const STYLER_MIGRATION_MAP = new Map<PublicStyler, PublicStyler>([
  ['strokeWeight', 'strokeWidth'],
  ['textStrokeWeight', 'textStrokeWidth'],
]);
export class ElementStylerMapping {
  elementStylerMappings = new Map<string, string[]>();

  initialize(taxonomyModel: any) {
    for (const elementStylerMapping of taxonomyModel.elementStylerMappings) {
      const publicKey = elementStylerKey(
        elementStylerMapping.publicElementStyler.publicElement,
        elementStylerMapping.publicElementStyler.publicStyler,
      );
      const internalKey = internalElementStylerKey(
        elementStylerMapping.internalElementStyler.configPath,
        elementStylerMapping.internalElementStyler.stylerName,
      );
      if (!this.elementStylerMappings.has(publicKey)) {
        this.elementStylerMappings.set(publicKey, []);
      }
      this.elementStylerMappings.get(publicKey)!.push(internalKey);
    }
  }
  private handleBackwardCompatiblePublicStylers(
    publicStyler: PublicStyler,
  ): PublicStyler {
    if (STYLER_MIGRATION_MAP.has(publicStyler)) {
      return STYLER_MIGRATION_MAP.get(publicStyler)!;
    }
    return publicStyler;
  }

  getInternalElementStyler(
    publicElement: PublicElementType,
    publicStyler: PublicStyler,
  ): [string, string] | undefined {
    publicStyler = this.handleBackwardCompatiblePublicStylers(publicStyler);
    const internalElementStyler = this.elementStylerMappings.get(
      elementStylerKey(publicElement, publicStyler),
    );
    if (!internalElementStyler || internalElementStyler.length === 0) {
      return undefined;
    }
    return internalElementStyler[0].split(DELIMITER) as [
      string,
      string,
    ];
  }

  getPublicElementStyler(
    internalElement: string,
    internalStyler: string,
  ): [PublicElementType, PublicStyler] | undefined {
    const internalElementStyler = `${internalElement}|${internalStyler}`;
    const publicElementStyler = [...this.elementStylerMappings.entries()].find(
      ([, internal]) => internal.includes(internalElementStyler),
    );
    if (!publicElementStyler) {
      return undefined;
    }
    return publicElementStyler[0].split(DELIMITER) as [
      PublicElementType,
      PublicStyler,
    ];
  }

  getPublicElement(internalElement: string): PublicElementType | undefined {
    const publicElement = [...this.elementStylerMappings.entries()].find(
      ([publicElementStyler, internalElementStyler]) =>
        internalElementStyler.find((elementStyler) =>
          elementStyler.startsWith(internalElement),
        ),
    );
    if (!publicElement) {
      return undefined;
    }
    return publicElement[0].split(DELIMITER)[0] as PublicElementType;
  }
}
export class FeatureMapping {
  internalToPublic = new Map<string, string>();
  publicToInternal = new Map<string, string>();

  initialize(taxonomyModel: any) {
    for (const info of taxonomyModel.taxonomyPathInfo) {
      if (!info.edithPath || !info.jsonPath) {
        continue;
      }
      this.internalToPublic.set(info.edithPath, info.jsonPath);
      this.publicToInternal.set(info.jsonPath, info.edithPath);
    }
  }

  getPublicIdFromConfigPath(configPath: string): string {
    return this.internalToPublic.get(configPath) ?? '';
  }

  getConfigPathFromPublicId(publicId: string): string {
    return this.publicToInternal.get(publicId) ?? '';
  }

}

interface UnmatchedKeyError {
  key: PublicStyler;
  errorType: ValidationErrorType;
}

function getDecimalPlaces(num: number) {
  const str = String(num);
  if (str.includes('.')) {
    return str.split('.')[1].length;
  }
  return 0;
}
export function checkMultipleOf(value: number, multipleOf: number) {
  const valuePlaces = getDecimalPlaces(value);
  const multipleOfPlaces = getDecimalPlaces(multipleOf);
  const scale = Math.pow(10, Math.max(valuePlaces, multipleOfPlaces));
  const scaledValue = Math.round(value * scale);
  const scaledMultiple = Math.round(multipleOf * scale);
  return scaledValue % scaledMultiple === 0;
}

const VISIBLE_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  return typeof value === 'boolean';
};

const COLOR_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  return typeof value === 'string' && COLOR_REGEX.test(value);
};

const WIDTH_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  return (
    typeof value === 'number' &&
    value >= MIN_WIDTH &&
    value <= MAX_WIDTH &&
    checkMultipleOf(value, WIDTH_MULTIPLE_OF)
  );
};
const ALPHA_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  return (
    typeof value === 'number' &&
    value >= MIN_ALPHA &&
    value <= MAX_ALPHA &&
    checkMultipleOf(value, ALPHA_MULTIPLE_OF)
  );
};
const ZOOM_KEY_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  if (typeof value !== 'string' || !value.startsWith('z')) {
    return false;
  }
  const zoom = Number(value.substring(1));
  return !isNaN(zoom) && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM;
};
const PASS_VALIDATOR: ValidatorFn = (value: PublicSingleStylerValue) => {
  return true;
};
function validateAlphaKeys(stylerConfig: PublicStylerValue) {
  const unmatchedAlphaKeys: UnmatchedKeyError[] = [];
  const alphaKeys = getAlphaKeys(stylerConfig);
  for (const key of alphaKeys) {
    const alphaKey = key as PublicStyler;
    const matchingKey = ALPHA_TO_COLOR_MAP.get(alphaKey)!;
    if (!stylerConfig[matchingKey]) {
      unmatchedAlphaKeys.push({
        key: alphaKey,
        errorType: ValidationErrorType.UNMATCHED_ALPHA_KEY,
      });
      continue;
    }
    if (isKeyzoom(stylerConfig[alphaKey])) {
      if (!isKeyzoom(stylerConfig[matchingKey])) {
        continue;
      }
      for (const zoom of Object.keys(stylerConfig[alphaKey])) {
        if (stylerConfig[matchingKey][zoom] === undefined) {
          unmatchedAlphaKeys.push({
            key: alphaKey,
            errorType: ValidationErrorType.ALPHA_KEYZOOM_COLOR_KEYZOOM_MISMATCH,
          });
        }
      }
      for (const zoom of Object.keys(stylerConfig[matchingKey])) {
        if (stylerConfig[alphaKey][zoom] === undefined) {
          unmatchedAlphaKeys.push({
            key: alphaKey,
            errorType: ValidationErrorType.ALPHA_KEYZOOM_COLOR_KEYZOOM_MISMATCH,
          });
        }
      }
    }
  }
  return unmatchedAlphaKeys;
}

function getAlphaKeys(stylerConfig: PublicStylerValue): string[] {
  return Object.keys(stylerConfig).filter((key) =>
    ALPHA_KEYS.includes(key as PublicStyler),
  );
}

function getValidatorFn(styler: PublicStyler): ValidatorFn | undefined {
  switch (styler) {
    case 'visible':
      return VISIBLE_VALIDATOR;
    case 'color':
    case 'fillColor':
    case 'strokeColor':
    case 'pinFillColor':
    case 'pinContainerColor':
    case 'pinOutlineColor':
    case 'pinGlyphColor':
    case 'iconColor':
    case 'textFillColor':
    case 'textStrokeColor':
      return COLOR_VALIDATOR;
    case 'strokeWidth':
    case 'textStrokeWidth':
    case 'strokeWeight':
    case 'textStrokeWeight':
      return WIDTH_VALIDATOR;
    case 'fillOpacity':
    case 'strokeOpacity':
    case 'textFillOpacity':
    case 'textStrokeOpacity':
      return ALPHA_VALIDATOR;
    default:
      return PASS_VALIDATOR;
  }
}
function getInternalStylerKey(
  styler: string,
): null | string {
  switch (styler) {
    case 'STYLE_VISIBILITY':
      return 'visibility';
    case 'STYLE_WEIGHT':
      return 'weight';
    case 'STYLE_COLOR':
      return 'color';
    case 'STYLE_ALPHA':
      return 'alpha';
    default:
      return null;
  }
}
export class StyleSheetValidator {
  private readonly featureElementStylerMap: FeatureElementStylerMap;

  constructor(
    taxonomyModel: any,
    featureMapping: FeatureMapping,
    elementStylerMapping: ElementStylerMapping,
  ) {
    this.featureElementStylerMap = this.buildFeatureElementStylerMap(
      taxonomyModel,
      featureMapping,
      elementStylerMapping,
    );
  }

  validateValue(
    value: PublicStylerOrZoomValue<PublicSingleStylerValue>,
    validatorFn: ValidatorFn,
  ): boolean {
    if (typeof value === 'object') {
      for (const [zoom, valueAtZoom] of Object.entries(value)) {
        if (!ZOOM_KEY_VALIDATOR(zoom)) {
          return false;
        }
        if (!validatorFn(valueAtZoom)) {
          return false;
        }
      }
      return true;
    }
    return validatorFn(value);
  }
  validateTopLevelKey(key: string, publicJSONModel: PublicJSONModel): boolean {
    if (key === 'monochrome') {
      return typeof publicJSONModel.monochrome === 'boolean';
    }
    if (key === 'variant') {
      return ['light', 'dark'].includes(publicJSONModel.variant!);
    }
    if (key === 'backgroundColor') {
      return (
        typeof publicJSONModel.backgroundColor === 'string' &&
        COLOR_REGEX.test(publicJSONModel.backgroundColor)
      );
    }
    if (key === 'styles') {
      return Array.isArray(publicJSONModel.styles);
    }
    return true;
  }

  validate(publicJSONModel: PublicJSONModel): ValidationError[] {
    const validationErrors: ValidationError[] = [];
    const validTopLevelKeys = [
      'monochrome',
      'variant',
      'backgroundColor',
      'styles',
      'metadata',
    ];
    for (const key of Object.keys(publicJSONModel)) {
      if (!validTopLevelKeys.includes(key)) {
        validationErrors.push({
          type: ValidationErrorType.INVALID_TOP_LEVEL_KEY,
          severity: ValidationSeverity.WARNING,
          message: `Invalid top-level key: ${key}`,
          invalidKey: key,
        });
        continue;
      }
      if (!this.validateTopLevelKey(key, publicJSONModel)) {
        const value = (publicJSONModel as any)[key] as any;
        validationErrors.push({
          type: ValidationErrorType.INVALID_TOP_LEVEL_VALUE,
          severity: ValidationSeverity.WARNING,
          message: `Invalid top-level value: ${key}: ${value}`,
          invalidKey: key,
          value,
        });
      }
    }
    if (!Array.isArray(publicJSONModel.styles)) {
      return this.sortErrors(validationErrors);
    }

    for (const style of publicJSONModel.styles ?? []) {
      if (!this.featureElementStylerMap[style.id]) {
        validationErrors.push({
          type: ValidationErrorType.FEATURE_NOT_FOUND,
          severity: ValidationSeverity.ERROR,
          message: `Feature not found: ${style.id}`,
          featureId: style.id,
        });
        continue;
      }
      for (const elementKey of Object.keys(style)) {
        if (elementKey === 'id') {
          continue;
        }
        const element = elementKey as PublicElementType;
        if (!this.featureElementStylerMap[style.id][element]) {
          validationErrors.push({
            type: ValidationErrorType.ELEMENT_NOT_FOUND,
            severity: ValidationSeverity.ERROR,
            message: `Element not found: ${style.id}, ${element}`,
            featureId: style.id,
            element,
          });
          continue;
        }
        const elementStylerMap =
          this.featureElementStylerMap[style.id][element]!;
        const elementConfig: PublicStylerValue = style[element]!;

        const alphaValidationResult = validateAlphaKeys(elementConfig);

        for (const alphaError of alphaValidationResult) {
          validationErrors.push({
            type: alphaError.errorType,
            severity: ValidationSeverity.ERROR,
            message: `Issue with alpha key: ${alphaError.key}. Opacity styles must be paired with a corresponding color style.`,
            featureId: style.id,
            element,
            styler: alphaError.key,
          });
        }
        for (const stylerKey of Object.keys(elementConfig)) {
          const styler = stylerKey as PublicStyler;
          if (STYLER_MIGRATION_MAP.has(styler)) {
            validationErrors.push({
              type: ValidationErrorType.DEPRECATED_STYLER,
              severity: ValidationSeverity.WARNING,
              message: `Styler is deprecated: ${style.id}, ${element}, ${styler}`,
              featureId: style.id,
              element,
              deprecatedStyler: styler,
              newStyler: STYLER_MIGRATION_MAP.get(styler)!,
            });
            continue;
          }
          const value = elementConfig[styler];
          if (value === undefined) {
            validationErrors.push({
              type: ValidationErrorType.STYLER_VALUE_NOT_FOUND,
              severity: ValidationSeverity.ERROR,
              message: `Styler value not found: ${style.id}, ${element}, ${styler}`,
              featureId: style.id,
              element,
              styler,
            });
            continue;
          }
          const validatorFn = elementStylerMap[styler];
          if (validatorFn === undefined) {
            validationErrors.push({
              type: ValidationErrorType.STYLER_NOT_FOUND,
              severity: ValidationSeverity.ERROR,
              message: `Styler not found: ${style.id}, ${element}, ${styler}`,
              featureId: style.id,
              element,
              styler,
            });
            continue;
          }
          if (!this.validateValue(value, validatorFn)) {
            validationErrors.push({
              type: ValidationErrorType.STYLER_VALUE_INVALID,
              severity: ValidationSeverity.ERROR,
              message: `Styler value invalid: ${style.id}, ${element}, ${styler}, ${value}`,
              featureId: style.id,
              element,
              styler,
              value,
            });
            continue;
          }
          if (isKeyzoom(value)) {
            if (value['z00'] === undefined) {
              validationErrors.push({
                type: ValidationErrorType.MISSING_ZOOM_ZERO,
                severity: ValidationSeverity.ERROR,
                message: `Zoom value invalid: ${style.id}, ${element}, ${styler}, z00 is missing`,
                featureId: style.id,
                element,
                styler,
                zoom: 0,
              });
              continue;
            }
          }
        }
      }
    }
    return this.sortErrors(validationErrors);
  }

  private sortErrors(validationErrors: ValidationError[]): ValidationError[] {
    return validationErrors.sort((a, b) => {
      if (a.severity === b.severity) {
        return 0;
      }
      if (a.severity === ValidationSeverity.ERROR) {
        return -1;
      }
      return 1;
    });
  }
  private buildFeatureElementStylerMap(
    taxonomyModel: any,
    featureMapping: FeatureMapping,
    elementStylerMapping: ElementStylerMapping,
  ): FeatureElementStylerMap {
    const featureMap: FeatureElementStylerMap = {};

    if (!taxonomyModel.features) {
      return featureMap;
    }

    const featuresToProcess = [...taxonomyModel.features];

    while (featuresToProcess.length > 0) {
      const feature = featuresToProcess.shift()!;
      if (!feature.configPath || !feature.elements) {
        continue;
      }
      const publicFeatureId = featureMapping.getPublicIdFromConfigPath(
        feature.configPath,
      );
      if (!publicFeatureId) {
        continue;
      }

      if (feature.features) {
        featuresToProcess.push(...feature.features);
      }

      const elementsMap: {
        [key in PublicElementType]?: {[key in PublicStyler]?: ValidatorFn};
      } = {};
      for (const element of feature.elements) {
        if (!element.styleProperties || element.styleProperties.length === 0) {
          continue;
        }
        for (const styleProperty of element.styleProperties) {
          const internalStylerKey = getInternalStylerKey(styleProperty.style);
          if (!internalStylerKey) {
            continue;
          }
          const publicElementStyler =
            elementStylerMapping.getPublicElementStyler(
              styleProperty.configPath,
              internalStylerKey,
            );
          if (!publicElementStyler) {
            continue;
          }
          const [publicElement, publicStyler] = publicElementStyler;
          const validatorFn = getValidatorFn(publicStyler);
          if (validatorFn === undefined) {
            continue;
          }

          if (!elementsMap[publicElement]) {
            elementsMap[publicElement] = {};
          }

          elementsMap[publicElement][publicStyler] = validatorFn;
        }
      }
      featureMap[publicFeatureId] = elementsMap;
    }
    return featureMap;
  }
}

export function getValidator() {
  const elementStylerMapping = new ElementStylerMapping();
  const featureMapping = new FeatureMapping();
  elementStylerMapping.initialize(TAXONOMY);
  featureMapping.initialize(TAXONOMY);
  return new StyleSheetValidator(TAXONOMY, featureMapping, elementStylerMapping);
}
