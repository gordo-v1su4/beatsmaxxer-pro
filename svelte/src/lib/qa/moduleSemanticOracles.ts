import {
  BRIEF_IDENTITY_COUNT_LEGACY,
  LIVE_IDENTITY_COUNT,
  MODULE_CONTROL_CONTRACTS,
  RETIRED_IDENTITIES,
  defaultRackIdentities,
  paletteSwapIdentities
} from '$lib/modules/controlContracts';
import { listCatalog } from '$lib/modules/catalog';

export const MODULE_SEMANTIC_ORACLES_VERSION = 'module-semantic-oracles.v1';

/**
 * Inventory oracle for G002. Per-control numeric fixtures (low/mid/high
 * artistic outcomes) land with G005+ module semantics — this version records
 * identity count, consumers, and default vs palette-swap placement so a later
 * probe cannot silently invent an 18th or 20th module.
 */
export function moduleSemanticOraclesV1() {
  return {
    version: MODULE_SEMANTIC_ORACLES_VERSION,
    liveIdentityCount: LIVE_IDENTITY_COUNT,
    briefIdentityCountLegacy: BRIEF_IDENTITY_COUNT_LEGACY,
    retiredIdentities: [...RETIRED_IDENTITIES],
    defaultRack: defaultRackIdentities(),
    paletteSwapIdentities: paletteSwapIdentities(),
    modules: Object.fromEntries(
      listCatalog().map((def) => {
        const contract = MODULE_CONTROL_CONTRACTS[def.id];
        return [
          def.id,
          {
            name: def.name,
            category: def.category,
            row: def.row,
            params: Object.fromEntries(
              Object.entries(contract?.params ?? {}).map(([key, spec]) => [
                key,
                {
                  consumers: [...spec.consumers],
                  gpuSlot: spec.gpuSlot ?? null,
                  default: def.params[key] ?? null
                }
              ])
            )
          }
        ];
      })
    )
  };
}
