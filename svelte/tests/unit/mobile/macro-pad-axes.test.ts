import { describe, expect, test } from 'vitest';
import { listCatalog } from '$lib/modules/catalog';
import { mobileSpecForModule } from '$lib/mobile/moduleControlSpecs';

/**
 * The macro pad takes its two axes from `mobileSpecForModule(id).sliders` —
 * the same pair the sheet renders as its first two faders, in the order the
 * module's author put them in. Nothing about the pad is configured separately,
 * which is the point: a module added later gets a pad without anyone
 * remembering to give it one.
 *
 * These lock that contract down, because the failure mode is silent. If a
 * module's spec ever loses a slider the pad simply stops appearing for it, and
 * nothing else in the app changes.
 */

const MODULES = listCatalog();

describe('macro pad axes', () => {
  test('the catalog is not empty', () => {
    expect(MODULES.length).toBeGreaterThan(0);
  });

  test('every catalog module offers two continuous parameters', () => {
    const withoutPad = MODULES.filter((m) => (mobileSpecForModule(m.id)?.sliders?.length ?? 0) < 2)
      .map((m) => m.id);

    // If this ever fails, the module named here shows no XY key on the phone.
    // That is a legitimate outcome for a module with one parameter — add it to
    // an allowance here with a note, rather than weakening the assertion.
    expect(withoutPad).toEqual([]);
  });

  test('axes are distinct, so the two do not fight over one parameter', () => {
    for (const module of MODULES) {
      const sliders = mobileSpecForModule(module.id)?.sliders ?? [];
      if (sliders.length < 2) continue;
      expect(sliders[0]!.param, `${module.id} axes`).not.toBe(sliders[1]!.param);
    }
  });

  test('every axis has a label short enough to sit on the glass', () => {
    for (const module of MODULES) {
      const sliders = mobileSpecForModule(module.id)?.sliders ?? [];
      for (const axis of sliders.slice(0, 2)) {
        expect(axis.label, `${module.id}.${axis.param}`).toBeTruthy();
        // Both labels and both values share one line over the picture.
        expect(axis.label.length, `${module.id}.${axis.param} label`).toBeLessThanOrEqual(12);
      }
    }
  });
});
