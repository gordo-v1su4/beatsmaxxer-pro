# Module system — drag & drop architecture

## Adding a new effect

1. Register in [`src/lib/modules/catalog.ts`](src/lib/modules/catalog.ts):

```ts
MODULE_CATALOG.set('myfx', {
  id: 'myfx',
  name: 'MY FX',
  shortName: 'MYFX',
  accentColor: '#ff00aa',
  row: 'top',        // 'top' | 'bottom' | 'both'
  compact: false,
  shaderKey: 'myfx',
  description: 'One-line blurb for palette',
  params: { mix: 100, /* ... */ }
});
```

2. Add WGSL in [`src/lib/rendering/webgpu/shaders/registry.ts`](src/lib/rendering/webgpu/shaders/registry.ts).

3. The module appears in the **FX LIB** palette automatically. Drag it onto any rack slot to assign.

## Rack model

- **8 fixed slots**: 4 top (beat FX) + 4 bottom (camera FX) — layout unchanged from the React app.
- `rackTop` / `rackBottom` stores hold module IDs per slot.
- Per-module state (params, clips, bypass) is keyed by **module ID**, not slot — follows the module when swapped.

## Drag & drop

| Action | Result |
|--------|--------|
| Drag rack header (⠿) | Reorder within row or swap across rows |
| Drag from FX LIB palette | Replace slot assignment (swap if module already in rack) |
| Hover target | Dashed glow + accent shadow on drop slot |
| While dragging | Floating ghost label follows cursor; source slot fades |

Implementation: `stores/drag.ts` + `RackSlot.svelte` + `ModulePalette.svelte` + `DragGhost.svelte`.

## Future: palette-only modules

When catalog size > 8, modules not in `rackTop`/`rackBottom` appear dimmed in the palette (`paletteOnly` derived store). Drag onto a slot to install; displaced module returns to palette-only state.
