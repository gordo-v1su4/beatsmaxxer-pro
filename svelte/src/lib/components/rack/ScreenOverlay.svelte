<script lang="ts">
  /**
   * CRT glass over a video surface: scanlines, a sheen down the top, and an
   * inset vignette.
   *
   * Every layer here is sized in absolute pixels, which is fine on the main
   * viewer and destructive on a rack preview. The vignette is the worst of it —
   * a 24px blur reaches 24px in from all four edges, so on the 164px-tall module
   * canvas it darkens ~29% of the image, against maybe 5% on the viewer. The
   * scanlines compound it: a 2px pitch on a preview that is rarely an even
   * number of device pixels aliases into visible banding rather than reading as
   * texture.
   *
   * So the treatment is scaled to the surface instead of being one fixed look.
   */
  interface Props {
    variant?: 'viewer' | 'module';
  }

  let { variant = 'viewer' }: Props = $props();

  const isModule = $derived(variant === 'module');
  // 3px pitch on modules: wide enough to survive fractional scaling without
  // moiré, and a third of the duty cycle so it tints rather than dims.
  const scanlines = $derived(
    isModule
      ? 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.05) 2px,rgba(0,0,0,0.05) 3px)'
      : 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.15) 1px,rgba(0,0,0,0.15) 2px)'
  );
  const sheenHeight = $derived(isModule ? '18%' : '30%');
  const sheenAlpha = $derived(isModule ? '0.022' : '0.045');
  const vignette = $derived(
    isModule
      ? 'inset 0 0 7px rgba(0,0,0,0.42), inset 1px 1px 2px rgba(0,0,0,0.28), inset -1px -1px 2px rgba(0,0,0,0.22)'
      : 'inset 0 0 24px rgba(0,0,0,0.85), inset 2px 2px 5px rgba(0,0,0,0.5), inset -2px -2px 5px rgba(0,0,0,0.4)'
  );
</script>

<div style="position:absolute;inset:0;pointer-events:none;z-index:5">
  <div style="position:absolute;inset:0;background-image:{scanlines};z-index:2"></div>
  <div
    style="position:absolute;left:0;right:0;top:0;height:{sheenHeight};background:linear-gradient(180deg,rgba(255,255,255,{sheenAlpha}),rgba(255,255,255,0));z-index:2"
  ></div>
  <div style="position:absolute;inset:0;box-shadow:{vignette};z-index:3"></div>
</div>
