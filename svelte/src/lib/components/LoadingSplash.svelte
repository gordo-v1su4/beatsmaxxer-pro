<script lang="ts">
  /**
   * First-load title card. The stall it covers is real work, not a fake delay:
   * the GPU device has to be acquired, then the 52KB module shader compiles
   * once per canvas as each preview builds its pipeline.
   *
   * BEATS flies in from the left, MAXXER from the right, they collide on the
   * centre line and flash, then PRO scoots in small at the end. On completion
   * it says HERE WE GO and animates off rather than blinking out.
   *
   * The meter is one segment per preview pipeline, so the blocks lighting up
   * are the actual work finishing — not a timer dressed up as progress. The
   * status line names the step underneath it.
   *
   * No webfont and no asset: this has to render instantly and offline inside
   * the Tauri shell, before anything else in the app exists.
   *
   * Underneath it runs a terminal strip: the boot log, newest line at the
   * bottom, naming the step that is currently running. Those lines are written
   * from JS, so they stop updating the instant the main thread blocks — which
   * is the point, because the line frozen on screen is the thing that is
   * taking the time.
   *
   * The hairline above the log is the liveness proof, and it is the one piece
   * of this file with a hard technical constraint: it animates `transform`
   * only, in a plain CSS keyframe, with no JS driving it. Compositor-driven
   * animations keep running while the main thread is stuck, so it carries on
   * sweeping through a shader compile that has frozen everything else. Do not
   * reach for `width`, `left`, `background-position` or a rAF tick here — all
   * of those live on the main thread and would freeze along with the app,
   * which turns a stall back into something indistinguishable from a crash.
   * The segment meter's pre-count charge follows the same rule: it pulses
   * `opacity` on a pseudo-element rather than swapping `background`.
   *
   * Add ?splash=hold to keep it up while iterating on the design.
   */
  import { bootLog } from '$lib/stores/bootLog';

  interface Props {
    /** 'gpu' while the adapter/device is acquired, 'shaders' while pipelines
        compile, 'go' to play the exit, 'ready' to unmount. */
    phase: 'gpu' | 'shaders' | 'go' | 'ready';
    done?: number;
    total?: number;
  }
  let { phase, done = 0, total = 0 }: Props = $props();

  const leaving = $derived(phase === 'go');
  // Fall back to a plausible block count only for the pre-count phase, so the
  // meter has something to sweep across before the denominator is known.
  const segments = $derived(total > 0 ? total : 12);
  const filled = $derived(phase === 'go' ? segments : Math.min(done, segments));
  const known = $derived(phase === 'shaders' && total > 0);

  const label = $derived(phase === 'gpu' ? 'ACQUIRING GPU DEVICE' : 'COMPILING SHADERS');
  const detail = $derived(known ? `PREVIEW PIPELINE ${done} / ${total}` : 'INITIALISING');

  // Last five only: the strip is anchored to the bottom of the screen and
  // grows upward, so an uncapped log would eventually walk over the title.
  const tail = $derived($bootLog.slice(-5));

  /**
   * Which display face the wordmark is cut from.
   *
   * Five are self-hosted under `static/fonts/` with their licences. They are
   * genuinely different shapes, not weights of one family, so the wordmark has
   * to be looked at in each rather than argued about — `?face=bungee` and so on
   * switches it, and `?splash=hold` keeps the card up while you compare.
   *
   * Anton is the default: heavy, condensed and close to the arcade-marquee slab
   * in the reference art once it is slanted.
   */
  const FACES: Record<string, { stack: string; slant: number; track: string }> = {
    anton: { stack: "'Anton'", slant: -8, track: '0.005em' },
    archivo: { stack: "'Archivo Black'", slant: -8, track: '-0.005em' },
    bungee: { stack: "'Bungee'", slant: 0, track: '0.01em' },
    audiowide: { stack: "'Audiowide'", slant: -6, track: '0.005em' },
    russo: { stack: "'Russo One'", slant: -8, track: '0.01em' }
  };

  const face = $derived.by(() => {
    if (typeof window === 'undefined') return FACES.anton!;
    const key = new URLSearchParams(window.location.search).get('face') ?? 'anton';
    return FACES[key] ?? FACES.anton!;
  });

  /**
   * Terminal block-letter wordmark, as an alternative to the chrome one.
   *
   * It belongs here more than it might look: the card already ends in a
   * monospace boot log, so a wordmark drawn out of box-drawing characters reads
   * as the same machine talking rather than as a second design.
   *
   * Column count is the whole constraint. Set on one line, BEATSMAXXER is about
   * 90 columns and cannot fit a 375px phone at any readable size. Stacked, the
   * wider half — MAXXER — is 51, which does. Both halves are padded to the same
   * 51 columns so the two blocks share an edge instead of centring two
   * different widths against each other.
   */
  const ASCII_COLUMNS = 51;

  const ASCII_BEATS = [
    '██████╗ ███████╗ █████╗ ████████╗███████╗          ',
    '██╔══██╗██╔════╝██╔══██╗╚══██╔══╝██╔════╝          ',
    '██████╔╝█████╗  ███████║   ██║   ███████╗          ',
    '██╔══██╗██╔══╝  ██╔══██║   ██║   ╚════██║          ',
    '██████╔╝███████╗██║  ██║   ██║   ███████║          ',
    '╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝          '
  ].join('\n');

  const ASCII_MAXXER = [
    '███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗███████╗██████╗ ',
    '████╗ ████║██╔══██╗╚██╗██╔╝╚██╗██╔╝██╔════╝██╔══██╗',
    '██╔████╔██║███████║ ╚███╔╝  ╚███╔╝ █████╗  ██████╔╝',
    '██║╚██╔╝██║██╔══██║ ██╔██╗  ██╔██╗ ██╔══╝  ██╔══██╗',
    '██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██╔╝ ██╗███████╗██║  ██║',
    '╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝'
  ].join('\n');

  const asciiTitle = $derived.by(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('title') === 'ascii';
  });
</script>

{#if phase !== 'ready'}
  <div
    class="splash"
    class:leaving
    role="status"
    aria-live="polite"
    aria-label="Loading Beatsmaxxer Pro"
    style="--face:{face.stack};--slant:{face.slant}deg;--face-track:{face.track}"
  >
    <span class="grid" aria-hidden="true"></span>
    <span class="stars" aria-hidden="true"></span>
    <div class="stage">
      <div class="title">
        <!-- data-word feeds the ::before extrude layer. `background-clip:text`
             and `text-shadow` cannot coexist on one element — the shadow paints
             behind glyphs that are transparent, so the gradient shows straight
             through it. The solid extrude therefore has to be its own layer
             sitting behind the clipped face. -->
        <span class="half left" data-word="BEATS">BEATS</span><span
          class="half right"
          data-word="MAXXER">MAXXER</span
        ><span class="pro">PRO</span>
        <span class="impact" aria-hidden="true"></span>
      </div>

      <div class="readout">
        <span class="phase">{label}</span>

        <div class="meter" class:sweeping={!known && phase !== 'go'} aria-hidden="true">
          {#each Array(segments) as _, i (i)}
            <span class="seg" class:on={i < filled} style="--i:{i}"></span>
          {/each}
        </div>

        <span class="detail">{detail}</span>
      </div>
    </div>

    <!-- aria-hidden: the readout above already announces phase and progress
         through the live region, and five churning log lines on top of that
         would be noise rather than information. -->
    <div class="tty" aria-hidden="true">
      <div class="wire">
        <span class="shuttle"></span>
      </div>
      <ol class="lines">
        {#each tail as step (step.id)}
          <li class:done={step.state === 'done'}>
            <span class="mark">{step.state === 'done' ? 'ok' : '>'}</span>
            <span class="text">{step.label}{step.note ? ` ${step.note}` : ''}</span>
          </li>
        {/each}
      </ol>
    </div>

    <div class="scanlines" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
{/if}

<style>
  /*
   * Phone sizing is driven by these properties rather than by a duplicated set
   * of rules. Two things break at phone size: the title is `white-space:
   * nowrap` with a 32px floor, so BEATSMAXXER measures ~10x its font size and
   * runs off a narrow screen; and in landscape there are ~390px of height for a
   * title that wants to be 6.2vw of an 850px viewport. Both are fixed by
   * scaling the type against whichever axis is scarcer.
   *
   * Two switches, because there are two ways to be the phone: an actual phone
   * (media query) and the review path — `?mobile=1` on a desktop browser, which
   * mounts the shell but still reports a fine pointer and a wide window.
   */
  .splash {
    --s-title: clamp(32px, 6.2vw, 86px);
    --s-pro: clamp(12px, 2.1vw, 28px);
    --s-pro-track: 0.3em;
    --s-phase-track: 0.3em;
    --s-detail: 10px;
    --s-detail-track: 0.16em;
    --s-stage-pad: 0px;
    --s-stage-w: min(1100px, 92vw);
    --s-readout-w: min(420px, 80vw);
    --s-readout-mt: clamp(22px, 4vh, 46px);
    --s-seg-h: 9px;
    --s-tty: 12px;
    --s-tty-pad: 20px;
    --s-tty-w: min(640px, 100%);
  }

  @media (max-width: 820px), (pointer: coarse) and (max-height: 500px) {
    .splash {
      /* vh participates so the word shrinks when the phone lies down. */
      --s-title: clamp(24px, min(8.4vw, 13vh), 64px);
      /* 11px is the phone type floor; the vw term only takes over above ~420px. */
      --s-pro: clamp(11px, 2.6vw, 20px);
      --s-pro-track: 0.24em;
      --s-phase-track: 0.24em;
      --s-detail: 11px;
      --s-stage-pad: 0 14px;
      --s-stage-w: min(1100px, 100%);
      --s-readout-w: min(420px, 100%);
      --s-readout-mt: clamp(18px, 4vh, 40px);
      --s-seg-h: 8px;
      /* 11px is the phone type floor and the log sits at it, not below. */
      --s-tty: 11px;
      --s-tty-pad: 14px;
      --s-tty-w: 100%;
    }
  }

  :global(.mobile-shell) .splash,
  :global(.mobile-shell-active) .splash {
    --s-title: clamp(24px, min(8.4vw, 13vh), 64px);
    --s-pro: clamp(11px, 2.6vw, 20px);
    --s-pro-track: 0.24em;
    --s-phase-track: 0.24em;
    --s-detail: 11px;
    --s-detail-track: 0.12em;
    --s-stage-pad: 0 14px;
    --s-stage-w: min(1100px, 100%);
    --s-readout-w: min(420px, 100%);
    --s-readout-mt: clamp(18px, 4vh, 40px);
    --s-seg-h: 8px;
    --s-tty: 11px;
    --s-tty-pad: 14px;
    --s-tty-w: 100%;
  }

  .splash {
    position: fixed;
    inset: 0;
    z-index: 4200;
    /* The card centres inside the safe area, so nothing lands under a notch
       when the phone is on its side. */
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(120% 90% at 50% 45%, rgba(20, 184, 166, 0.10), transparent 62%),
      rgba(4, 6, 7, 0.95);
    backdrop-filter: blur(18px) saturate(0.55);
    -webkit-backdrop-filter: blur(18px) saturate(0.55);
    animation: fade-in 220ms ease-out both;
  }

  /* Hand off rather than blink out: lift, brighten, then go. */
  .splash.leaving {
    animation: fade-out 620ms cubic-bezier(0.4, 0, 0.9, 0.4) 260ms both;
  }
  @keyframes fade-out {
    0%   { opacity: 1; transform: scale(1); }
    30%  { opacity: 1; transform: scale(1.012); }
    100% { opacity: 0; transform: scale(1.055); }
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: var(--s-stage-w);
    padding: var(--s-stage-pad);
  }

  /* One baseline, so PRO sits at the end of the word rather than under it. */
  .title {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: center;
    white-space: nowrap;
    font-family: var(--face), var(--font-ui), system-ui, sans-serif;
    font-weight: 400;
    line-height: 1;
    /* The slant is applied to the row, not per-glyph, so BEATS and MAXXER stay
       on one shear plane and the seam between them does not kink. */
    transform: skewX(var(--slant));
  }

  /*
    The chrome.
    ───────────
    Four stacked layers, because no single CSS property does this:

      ::before  the extruded body — the same word in a dark plum, offset down
                and right in 1px steps, plus a dark outline so the face has an
                edge to sit against
      ::after   the top bevel — a hairline of near-white clipped to the upper
                edge, which is what makes the face read as a machined surface
                rather than a gradient fill
      .half     the face itself: a gradient with a HARD stop at 47%, which is
                the horizon break that every reference has running through the
                letterforms
      filter    the bloom, in magenta rather than the face colour so it reads as
                light spilling off chrome instead of a coloured shadow
  */
  /*
    Paint order matters more than anything else here, and it is not obvious:
    `background-clip: text` paints in the element's *background* layer, which is
    below BOTH pseudo-elements — even one set to `z-index: -1`. Putting the
    extrude on ::before and the gradient on .half therefore buries the chrome
    under the extrude, and the wordmark comes out dark with only a glow.

    So the element itself is the extruded body, and the chrome face is ::before
    painted on top of it, with the bevel hairline on ::after above that.
  */
  /*
    Deliberately plain.

    This carried a nine-step extrude, a hard horizon break and a clipped bevel
    layer, chasing the chrome in the reference art. Every one of those needs the
    resolution and the hand-placed highlights of a raster treatment to read; in
    CSS at phone size they stacked into mud and the wordmark got harder to read
    with each addition.

    So: one gradient, one shadow for separation, one soft glow. Clean type set
    confidently beats a poor imitation of chrome, and it is a better base for
    real art to replace later.
  */
  .half {
    position: relative;
    font-size: var(--s-title);
    letter-spacing: var(--face-track);
    /* The face is the gradient on ::before; this layer only separates the mark
       from the field behind it. */
    color: transparent;
    text-shadow: none;
    filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.8))
      drop-shadow(0 0 26px rgba(45, 212, 191, 0.3));
  }

  /* ::after carried the white bevel band. It is gone — a specular hairline is
     the last thing to add once the rest is right, not the first. */
  .half::before {
    content: attr(data-word);
    position: absolute;
    left: 0;
    top: 0;
    letter-spacing: inherit;
    pointer-events: none;
  }

  /* The face. A hard stop at 47% is the horizon break the reference art runs
     through every letterform — a 0.6% band, not a blend, or it turns to mush. */
  /*
    The ramp is sized to the CAP HEIGHT, not to the element box.

    A gradient on a text element spans the whole line box, which for a display
    face is a good deal taller than the letters — so 0% lands in the empty air
    above the caps and the horizon break falls below the baseline. The visible
    result is a mark that is purple almost all the way up with its bright half
    wasted on nothing.

    Anton's caps occupy roughly 0.72em starting ~0.17em down the box, so the
    ramp is given exactly that band and told not to repeat. Every stop below is
    therefore a real position on the letterform.
  */
  .half::before {
    /*
      Every stop is a light value. The previous ramp put #241a52 at the horizon
      and stayed under #5c34a0 for the whole lower half — near-black letters on
      a near-black field, which is why the mark could not be read at all. The
      horizon in the reference art is a *thin dark line* separating two bright
      halves, not a fade into the background.
    */
    background-image: linear-gradient(
      180deg,
      /*
        Legibility comes from luminance, not hue. The mark sits on #0a0b0c, so
        every stop that is not the horizon line has to be *light* — earlier
        ramps spent half the letterform in the 20-40% lightness range, which is
        near-black on near-black and unreadable at any size.

        Teal rather than the reference art's magenta: it is already the app's
        accent, so the splash and the instrument read as one product.

        Stops are placed for where the caps sit in the line box (~16% to 100%),
        not for the box edges.
      */
      /*
        Teal-led, not white-led. Starting the ramp at #ffffff made the mark a
        bright slab on a near-black screen — it read as a light-mode logo
        dropped onto a dark app rather than as part of it. Leading with a light
        teal keeps enough luminance to be legible against #0a0b0c while staying
        inside the palette the rest of the UI uses.

        Three stops and no break: the hard horizon line needed hand-placed
        highlights either side of it to read as metal, and without them it was
        just a dark band cutting every letter in half.
      */
      #9ff2e4 18%,
      #2dd4bf 62%,
      #17a091 100%
    );
    /*
      Deliberately NOT sized to a cap-height band. Clipping the ramp to 0.72em
      with `no-repeat` left the glyph below that band with no background at all,
      so the bottom of every letter fell through to the dark extrude body — the
      mark was unreadable for exactly that reason. A full-box ramp always paints
      the whole letterform; the stops below are placed for where the glyphs
      actually sit in the box rather than for the box itself.
    */
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    /* A thin dark rim so the face reads as sitting on the body rather than
       floating a shade above it. */
    -webkit-text-stroke: 0.5px rgba(20, 11, 36, 0.55);
  }

  /*
    Top bevel: a hairline of near-white on the cap edge. Clipped in em units
    against the same band as the ramp — the previous percentage clip cut the
    element box, which put the highlight in the air above the caps where it read
    as a floating white bar rather than as a lit edge.
  */
  /*
    The top highlight, blended rather than stacked.

    This was a flat white fill clipped to a band, which is why it read as a bar
    laid across the word instead of light catching an edge: a hard clip has no
    falloff, and an opaque colour hides the chrome underneath rather than
    brightening it.

    Now it is a gradient that steps down to nothing over the top third, and it
    is composited with `overlay` — so it multiplies into the dark parts of the
    ramp and screens into the light ones, which is what a real specular does.
    The band edge is gone entirely; the falloff is the shape.
  */
  /* Removed. Kept only as a note: `screen` is the right mode for a specular —
     `overlay` decides from the base and so darkens the lower half of a ramp. */

  /*
    The world the wordmark sits in. Both layers are pure CSS — no image, so they
    cost nothing to ship and stay sharp on any display.
  */

  /* Starfield: three repeating radial-gradients at different densities. One
     layer reads as a pattern; three at coprime spacings read as random. */
  .stars {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image:
      radial-gradient(1.1px 1.1px at 17% 23%, rgba(255, 255, 255, 0.85), transparent 100%),
      radial-gradient(1px 1px at 63% 11%, rgba(200, 225, 255, 0.7), transparent 100%),
      radial-gradient(1.4px 1.4px at 82% 41%, rgba(255, 255, 255, 0.6), transparent 100%),
      radial-gradient(1px 1px at 34% 67%, rgba(255, 220, 255, 0.55), transparent 100%),
      radial-gradient(1.2px 1.2px at 91% 78%, rgba(255, 255, 255, 0.5), transparent 100%),
      radial-gradient(1px 1px at 8% 88%, rgba(190, 210, 255, 0.6), transparent 100%);
    background-size:
      163px 149px,
      211px 197px,
      127px 181px,
      241px 173px,
      179px 227px,
      139px 211px;
    /* Slow drift, transform-only so it survives a blocked main thread the same
       way the boot-log indicator does. */
    animation: drift 240s linear infinite;
    opacity: 0.55;
  }
  @keyframes drift {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      transform: translate3d(-163px, -149px, 0);
    }
  }

  /* Perspective floor. A repeating linear-gradient rotated into the X plane is
     the whole trick — the mask fades it out before the horizon so it does not
     terminate in a hard line. */
  .grid {
    position: absolute;
    left: -50%;
    right: -50%;
    bottom: -10%;
    height: 62%;
    z-index: 0;
    pointer-events: none;
    background-image:
      repeating-linear-gradient(
        90deg,
        rgba(232, 72, 156, 0.5) 0 1px,
        transparent 1px 76px
      ),
      repeating-linear-gradient(
        0deg,
        rgba(120, 90, 230, 0.42) 0 1px,
        transparent 1px 58px
      );
    transform: perspective(340px) rotateX(74deg);
    transform-origin: 50% 100%;
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 42%, #000 100%);
    mask-image: linear-gradient(180deg, transparent 0%, #000 42%, #000 100%);
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .stars {
      animation: none;
    }
  }

  /*
    Phone: stack the wordmark.
    ──────────────────────────
    BEATSMAXXER is eleven characters. Set on one line at 375px it can only be
    ~31px, which is why the hero of the loading screen was reading as a caption
    with an acre of black around it. Every piece of the reference art stacks for
    exactly this reason — RUNHOAN over Records, Hyperpix over ARCADE — and once
    the halves are stacked the face can be three times the size in the same
    width. The collide animation still works; the halves just meet vertically.
  */
  /*
    Portrait only. A phone on its side has the width for one line, and stacking
    two 100px lines into a 390px-tall viewport would leave no room for the
    readout or the log.

    Both selectors are listed because `:global(.mobile-shell-active) .splash`
    already sets `--s-title` elsewhere and outranks a bare `.splash` even inside
    a media query — matching its specificity is the only way this value lands.
  */
  @media (max-width: 820px) and (orientation: portrait) {
    .splash,
    :global(.mobile-shell-active) .splash {
      /* MAXXER is the constraint: six characters of Anton run ~0.52em each, so
         26vw keeps the wider half inside 375px with margin to spare. */
      --s-title: clamp(56px, 26vw, 132px);
    }

    .title {
      flex-direction: column;
      align-items: center;
      gap: 0;
      /* 0.82 collapsed the halves into each other — the descender box of BEATS
         landed inside MAXXER's cap height and the extrudes interleaved. 0.92
         still locks them as one object without the words touching. */
      line-height: 0.92;
    }

    .half.right {
      /* MAXXER is the wider word; nudging it left of centre by a hair lines the
         stems up under BEATS rather than centring two different widths. */
      margin-left: -0.02em;
    }

    /* PRO leaves the flex flow so stacking does not push it onto a third line;
       it tucks against the bottom-right corner the way the references set their
       secondary word. */
    .pro {
      position: absolute;
      right: 0;
      bottom: -0.42em;
      margin-left: 0;
    }

    /* The halves arrive vertically now, so a horizontal overshoot would slide
       them off their own stack. */
    .left {
      animation-name: slam-down;
    }
    .right {
      animation-name: slam-up;
    }
  }

  @keyframes slam-down {
    0% {
      opacity: 0;
      transform: translateY(-46vh);
    }
    64% {
      opacity: 1;
      transform: translateY(7px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes slam-up {
    0% {
      opacity: 0;
      transform: translateY(46vh);
    }
    64% {
      opacity: 1;
      transform: translateY(-7px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* The collision: each half arrives from its own side, overshoots slightly
     past the seam, then settles — that snap back is what reads as impact. */
  .left  { animation: slam-left  600ms cubic-bezier(0.16, 1.02, 0.28, 1) 120ms both; }
  .right { animation: slam-right 600ms cubic-bezier(0.16, 1.02, 0.28, 1) 120ms both; }

  @keyframes slam-left {
    0%   { opacity: 0; transform: translateX(-58vw); }
    64%  { opacity: 1; transform: translateX(12px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes slam-right {
    0%   { opacity: 0; transform: translateX(58vw); }
    64%  { opacity: 1; transform: translateX(-12px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  /* Smaller, and after the word — not stacked under it. */
  /* Sits on the baseline after MAXXER, in the pink half of the chrome ramp so
     it reads as part of the same object rather than as a separate label. */
  .pro {
    margin-left: clamp(7px, 0.9vw, 15px);
    font-size: var(--s-pro);
    font-weight: 400;
    letter-spacing: var(--s-pro-track);
    /*
      PRO was set at the same weight as body chrome in a pale teal, tucked under
      the corner of MAXXER — at that size and contrast it disappeared into the
      glow of the word above it. It is part of the mark, so it gets its own
      plate: solid dark chip, bright text, real letterspacing.
    */
    padding: 0.06em 0.22em;
    border-radius: 2px;
    background: rgba(8, 26, 24, 0.9);
    border: 1px solid rgba(45, 212, 191, 0.45);
    color: #d9fff8;
    text-shadow: 0 0 10px rgba(45, 212, 191, 0.6);
    animation: scoot 440ms cubic-bezier(0.2, 0.9, 0.25, 1) 680ms both;
  }
  @keyframes scoot {
    0%   { opacity: 0; transform: translateX(22px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  /* White flash on the seam at the moment the halves meet. */
  .impact {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3px;
    height: 116%;
    background: #eafffb;
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(0.2);
    animation: impact 360ms ease-out 600ms both;
  }
  @keyframes impact {
    0%   { opacity: 0;    transform: translate(-50%, -50%) scaleY(0.2); filter: blur(0); }
    18%  { opacity: 0.95; transform: translate(-50%, -50%) scaleY(1);   filter: blur(2px); }
    100% { opacity: 0;    transform: translate(-50%, -50%) scaleY(1.1); filter: blur(14px); }
  }

  /* ---- readout ---- */
  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: var(--s-readout-w);
    margin-top: var(--s-readout-mt);
    animation: fade-in 400ms ease-out 950ms both;
  }

  .phase {
    color: #99f6e4;
    font-family: var(--font-ui), system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: var(--s-phase-track);
  }

  /* Segmented power meter: one block per preview pipeline. */
  .meter {
    display: flex;
    gap: 3px;
    width: 100%;
    margin: 13px 0 10px;
  }

  .seg {
    position: relative;
    flex: 1 1 0;
    height: var(--s-seg-h);
    background: #0e1c1b;
    box-shadow: inset 0 0 0 1px #16302d;
    transition: background 140ms linear, box-shadow 140ms linear;
  }

  /* The charge lives on this layer so it can be an opacity fade. Painting it
     once and revealing it costs the compositor nothing to keep running; the
     old version swapped `background` every frame, which is main-thread work
     and therefore stopped dead during the very stall it was covering. */
  .seg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, #7df0e0, #14b8a6);
    box-shadow: inset 0 0 0 1px #5eead4;
    opacity: 0;
  }

  .seg.on {
    background: linear-gradient(180deg, #7df0e0, #14b8a6);
    box-shadow:
      inset 0 0 0 1px #5eead4,
      0 0 10px rgba(45, 212, 191, 0.55);
  }

  /* Before the denominator is known there is nothing honest to fill, so run a
     charge across the blocks instead of parking at zero. */
  .meter.sweeping .seg::after {
    animation: charge 1.25s ease-in-out infinite;
    animation-delay: calc(var(--i) * 70ms);
    will-change: opacity;
  }
  @keyframes charge {
    0%, 70%, 100% { opacity: 0; }
    22%           { opacity: 1; }
  }

  .detail {
    color: #5c6a72;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--s-detail);
    letter-spacing: var(--s-detail-track);
  }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* ---- terminal strip ----
     Bottom-anchored, so new lines push the stack upward and nothing above it
     ever moves. Sits above the vignette, which would otherwise be darkening
     exactly the corner the text lives in. */
  .tty {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    padding: 0 var(--s-tty-pad) max(12px, env(safe-area-inset-bottom, 0px));
    pointer-events: none;
    animation: fade-in 300ms ease-out 180ms both;
  }

  .wire,
  .lines {
    width: var(--s-tty-w);
  }

  /* ---- the liveness hairline ----
     Everything about this element is chosen so the compositor can run it
     without the main thread: fixed geometry, a single translated child, and
     keyframes that touch nothing but `transform`. That is what lets it keep
     sweeping while a shader compile has the main thread pinned. */
  .wire {
    position: relative;
    height: 2px;
    overflow: hidden;
    background: rgba(20, 184, 166, 0.10);
  }

  .shuttle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    /* Static width; the travel is all transform. */
    width: 26%;
    background: linear-gradient(90deg, transparent, #14b8a6 42%, #a7fff2 52%, #14b8a6 62%, transparent);
    will-change: transform;
    transform: translate3d(-100%, 0, 0);
    animation: shuttle 1.15s linear infinite;
  }

  /* 26% wide, so 385% clears the right edge exactly. */
  @keyframes shuttle {
    from { transform: translate3d(-100%, 0, 0); }
    to   { transform: translate3d(385%, 0, 0); }
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .lines li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--s-tty);
    line-height: 1.5;
    color: #7c9a9a;
  }

  /* Finished work recedes; the running line is the one worth reading. */
  .lines li.done { color: #4b5d63; }

  .mark {
    flex: none;
    width: 2ch;
    text-align: right;
    color: #2dd4bf;
  }
  .lines li.done .mark { color: #14b8a6; }

  .text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ---- CRT dressing ---- */
  .scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.3;
    background: repeating-linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.5) 3px,
      rgba(0, 0, 0, 0.5) 4px
    );
  }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 90% at 50% 50%, transparent 54%, rgba(0, 0, 0, 0.74));
  }

  /* Motion is decoration; the readout still carries the information. */
  @media (prefers-reduced-motion: reduce) {
    .splash, .splash.leaving, .left, .right, .pro, .readout, .tty { animation: none; }
    .left, .right, .pro, .readout, .tty { opacity: 1; transform: none; }
    .impact { display: none; }
    .meter.sweeping .seg::after { animation: none; }

    /* The hairline keeps going even here. Travel is what people object to, so
       it stops travelling and breathes instead — still opacity-only, still on
       the compositor, still the one thing that proves the app is alive when
       the main thread is gone. */
    .shuttle {
      width: 100%;
      transform: none;
      animation: breathe 2.6s ease-in-out infinite;
      will-change: opacity;
    }
    @keyframes breathe {
      0%, 100% { opacity: 0.16; }
      50%      { opacity: 0.75; }
    }
  }
</style>
