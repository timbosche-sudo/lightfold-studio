import type { ShadeCommonParams, ShadeDesign, ShadeFamilyId } from '../../types/project';
import { cylinderShade, defaultCommonParams } from './cylinder';
import { createShellGenerator } from './shell/engine';
import { foldFamily, organicFamily, rippleFamily, twistFamily } from './shell/families';
import type { ShadeGenerator } from './types';

type FamilyParams<K extends ShadeFamilyId> = ShadeDesign[K];

/** Registry of shade families, in the order shown in Form Studio. New families are added here. */
export const SHADE_GENERATORS: { [K in ShadeFamilyId]: ShadeGenerator<FamilyParams<K>> } = {
  cylinder: cylinderShade,
  twist: createShellGenerator(twistFamily),
  ripple: createShellGenerator(rippleFamily),
  organic: createShellGenerator(organicFamily),
  fold: createShellGenerator(foldFamily),
};

export const FAMILY_ORDER: ShadeFamilyId[] = ['cylinder', 'twist', 'ripple', 'organic', 'fold'];

export function defaultShadeDesign(): ShadeDesign {
  return {
    family: 'cylinder',
    common: defaultCommonParams(),
    cylinder: cylinderShade.defaults(),
    twist: SHADE_GENERATORS.twist.defaults(),
    ripple: SHADE_GENERATORS.ripple.defaults(),
    organic: SHADE_GENERATORS.organic.defaults(),
    fold: SHADE_GENERATORS.fold.defaults(),
  };
}

export type AnyParams = ShadeCommonParams & Record<string, unknown>;

/** The active generator with its merged (shared + family) parameters, typed loosely for generic callers. */
export function activeShade(design: ShadeDesign): { generator: ShadeGenerator<unknown>; params: AnyParams } {
  return shadeFor(design, design.family);
}

export function shadeFor(design: ShadeDesign, family: ShadeFamilyId): { generator: ShadeGenerator<unknown>; params: AnyParams } {
  const generator = SHADE_GENERATORS[family] as ShadeGenerator<unknown>;
  return { generator, params: { ...design.common, ...(design[family] as object) } as AnyParams };
}
