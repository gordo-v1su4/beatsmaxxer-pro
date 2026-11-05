import type { ModulePreset } from './presets';

/** Match preset-owned parameters; ignore independent routing/density values.
 * Only floating-point noise is tolerated: a one-unit edit can change a mode.
 */
export function matchingPreset(
  params: Readonly<Partial<Record<string, number>>>,
  presets: readonly ModulePreset[],
): ModulePreset | null {
  let selected: ModulePreset | null = null;
  let closest = Infinity;
  for (const preset of presets) {
    const entries = Object.entries(preset.set);
    if (!entries.length) continue;
    let distance = 0;
    let matches = true;
    for (const [key, value] of entries) {
      const actual = params[key];
      if (typeof actual !== 'number' || !Number.isFinite(actual) || !Number.isFinite(value) || Math.abs(actual - value) > 1e-6) {
        matches = false;
        break;
      }
      distance += Math.abs(actual - value);
    }
    if (matches && distance < closest) {
      selected = preset;
      closest = distance;
    }
  }
  return selected;
}
