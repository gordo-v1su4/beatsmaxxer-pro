<script lang="ts">
  import Knob from '$lib/components/Knob.svelte';
  import Section from './rack/Section.svelte';
  import RackBtn from './rack/RackBtn.svelte';
  import HSlider from './rack/HSlider.svelte';
  import MiniDisplay from './rack/MiniDisplay.svelte';
  import { computeSpeedRampRate } from '$lib/runtime/speedramp';
  import FeelGlyph from './rack/FeelGlyph.svelte';

  interface Props {
    moduleId: string;
    params: Record<string, number>;
    onUpdate: (p: string, v: number) => void;
    color: string;
  }
  let { moduleId, params, onUpdate, color }: Props = $props();

  const TRANSITION_PACK = [
    { l: 'WHP L', v: 0 }, { l: 'WHP R', v: 1 }, { l: 'PSH U', v: 2 }, { l: 'PSH D', v: 3 },
    { l: 'WIPE', v: 4 }, { l: 'ROLL', v: 5 }, { l: 'ZOOM', v: 6 }, { l: 'GLTC', v: 7 },
    { l: 'TILT', v: 8 }, { l: 'SPIN', v: 9 }, { l: 'ZM -', v: 10 }, { l: 'BARS', v: 11 },
    { l: 'IRIS', v: 12 }, { l: 'SLCE', v: 13 }, { l: 'FLSH', v: 14 }, { l: 'DFOC', v: 15 }
  ];

  const RAMP_SHAPES = [
    { key: 'FLAT', pts: { y0: 50, x1: 33, y1: 50, x2: 66, y2: 50, y3: 50 } },
    { key: 'UP', pts: { y0: 0, x1: 40, y1: 15, x2: 70, y2: 85, y3: 100 } },
    { key: 'DOWN', pts: { y0: 100, x1: 30, y1: 85, x2: 60, y2: 15, y3: 0 } },
    { key: 'S', pts: { y0: 0, x1: 78, y1: 2, x2: 22, y2: 98, y3: 100 } },
    { key: 'DIP', pts: { y0: 100, x1: 35, y1: 0, x2: 65, y2: 0, y3: 100 } },
    { key: 'BUMP', pts: { y0: 0, x1: 35, y1: 100, x2: 65, y2: 100, y3: 0 } },
    { key: 'LATE+', pts: { y0: 50, x1: 80, y1: 50, x2: 92, y2: 64, y3: 100 } },
    { key: 'LATE-', pts: { y0: 50, x1: 80, y1: 50, x2: 92, y2: 36, y3: 0 } },
    { key: 'EASE+', pts: { y0: 100, x1: 8, y1: 64, x2: 20, y2: 50, y3: 50 } },
    { key: 'EASE-', pts: { y0: 0, x1: 8, y1: 36, x2: 20, y2: 50, y3: 50 } },
    { key: 'INV-S', pts: { y0: 0, x1: 90, y1: 100, x2: 10, y2: 0, y3: 100 } },
    { key: 'SLAM', pts: { y0: 0, x1: 96, y1: 0, x2: 99, y2: 100, y3: 100 } }
  ] as const;

  const intervalP = $derived(params.interval ?? 50);
  const lenP = $derived(params.len ?? 50);
  const durBeats = $derived(0.15 + ((params.duration ?? 40) / 100) * 0.85);
  const stutterMode = $derived(Math.round(params.type ?? 0) === 1);
  const rate = $derived(0.25 + ((params.rate ?? 43) / 100) * 1.75);
  const loops = $derived(Math.max(1, Math.round(params.loops ?? 2)));

  /**
   * What the ramp actually reaches, not what the endpoints say.
   *
   * The MIN/MAX knobs set the ends of the rate range, and the readouts used to
   * print those ends directly — so the card claimed 0.50x while the default
   * curve bottoms out at 0.71x. A cubic bezier does not pass through its control
   * points: with bzY1 and bzY2 at 0 the curve only dips to 0.25, so the low end
   * of the range is never demanded. Sampling the real curve is the only honest
   * way to say what the module will do.
   */
  const CYCLE_BEATS = [1, 2, 4, 8, 16, 24, 32];
  const achievedRange = $derived.by(() => {
    if (moduleId !== 'speedramp') return { min: 1, max: 1 };
    const cycle = CYCLE_BEATS[Math.min(6, Math.floor(((params.len ?? 36) / 100) * 7))];
    let min = Infinity;
    let max = 0;
    for (let i = 0; i <= 48; i++) {
      const r = computeSpeedRampRate((i / 48) * cycle, params, false);
      if (r < min) min = r;
      if (r > max) max = r;
    }
    return { min, max };
  });

  const activeRampKey = $derived.by(() => {
    let best = '';
    let bestD = 1e9;
    for (const sh of RAMP_SHAPES) {
      const d =
        Math.abs((params.bzY0 ?? 100) - sh.pts.y0) +
        Math.abs((params.bzY1 ?? 0) - sh.pts.y1) +
        Math.abs((params.bzY2 ?? 0) - sh.pts.y2) +
        Math.abs((params.bzY3 ?? 100) - sh.pts.y3);
      if (d < bestD) {
        bestD = d;
        best = sh.key;
      }
    }
    return bestD < 40 ? best : '';
  });

  function applyRamp(c: (typeof RAMP_SHAPES)[number]['pts']) {
    onUpdate('bzY0', c.y0);
    onUpdate('bzX1', c.x1);
    onUpdate('bzY1', c.y1);
    onUpdate('bzX2', c.x2);
    onUpdate('bzY2', c.y2);
    onUpdate('bzY3', c.y3);
  }

  function rampSpeed(v: number) {
    return (0.25 * Math.pow(2, v / 25)).toFixed(2);
  }
</script>

{#if moduleId === 'transition'}
  <div style="display:flex;flex-direction:column;flex:1">
    <Section label="PACK" {color}>
      <!-- Six across, not eight. At the 272px module minimum an 8-column grid
           gives each move ~30px, and the longest labels ("WHP L", "GLTC") need
           about 30px of glyph on their own — so they clipped. Six columns gives
           ~41px and costs one extra 16px row. -->
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:2px">
        {#each TRANSITION_PACK as o (o.l)}
          <!-- fill, not a fixed 34px: these sit in `repeat(8, 1fr)`, so on a
               narrow module the tracks shrink while a pixel-width button does
               not, and the last moves overflow the module's own edge. -->
          <RackBtn
            label={o.l}
            active={Math.round(params.type ?? 0) === o.v}
            {color}
            fill
            onclick={() => {
              onUpdate('type', o.v);
              onUpdate('trig', ((params.trig ?? 0) + 1) % 100);
            }}
          />
        {/each}
      </div>
    </Section>
    <Section label="FIRE" {color}>
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each [{ l: '1BT', val: 7 }, { l: '2BT', val: 21 }, { l: '1BR', val: 36 }, { l: '2BR', val: 50 }, { l: '4BR', val: 64 }, { l: '6BR', val: 79 }, { l: '8BR', val: 93 }] as v, i (v.l)}
          <RackBtn
            label={v.l}
            active={Math.min(6, Math.floor(intervalP * 7 / 100)) === i}
            {color}
            width={28}
            onclick={() => onUpdate('interval', v.val)}
          />
        {/each}
        <div style="flex:1"></div>
        <RackBtn
          label="FIRE"
          color="#ef4444"
          width={32}
          onclick={() => onUpdate('trig', ((params.trig ?? 0) + 1) % 100)}
        />
      </div>
    </Section>
    <Section label="SHPE" {color} noBorder>
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:flex-end;gap:8px">
          <div style="flex:1">
            <HSlider
              value={params.duration ?? 40}
              onChange={(v) => onUpdate('duration', v)}
              {color}
              label="MOVE LENGTH"
              controlId="{moduleId}-duration"
            />
          </div>
          <MiniDisplay value={`${durBeats.toFixed(2)}bt`} width={44} />
        </div>
        <HSlider
          value={params.amount ?? 60}
          onChange={(v) => onUpdate('amount', v)}
          {color}
          label="MOTION BLUR"
          controlId="{moduleId}-amount"
        />
      </div>
    </Section>
  </div>
{:else if moduleId === 'speedramp'}
  <div style="display:flex;flex-direction:column;flex:1">
    <Section label="SHAPE" {color}>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px">
        {#each RAMP_SHAPES as sh (sh.key)}
          {@const W = 44}
          {@const H = 30}
          {@const P = 4}
          {@const X = (v: number) => P + (v / 100) * (W - P * 2)}
          {@const Y = (v: number) => P + ((100 - v) / 100) * (H - P * 2)}
          <button
            type="button"
            title={sh.key}
            onclick={() => applyRamp(sh.pts)}
            style="width:100%;height:26px;padding:0;cursor:pointer;background:{activeRampKey === sh.key
              ? `linear-gradient(180deg,${color}22,${color}0e)`
              : 'linear-gradient(180deg,#181a1c,#141618)'};border:1px solid {activeRampKey === sh.key
              ? color + '77'
              : '#1e2226'};border-radius:2px;box-shadow:{activeRampKey === sh.key
              ? `inset 0 1px 3px rgba(0,0,0,0.5), 0 0 6px ${color}22`
              : 'inset 0 1px 2px rgba(0,0,0,0.4)'}"
          >
            <svg viewBox="0 0 {W} {H}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">
              <line x1="0" y1={Y(50)} x2={W} y2={Y(50)} stroke="#2a2e34" stroke-width="0.6" stroke-dasharray="2 2" />
              <path
                d="M {X(0)} {Y(sh.pts.y0)} C {X(sh.pts.x1)} {Y(sh.pts.y1)}, {X(sh.pts.x2)} {Y(sh.pts.y2)}, {X(100)} {Y(sh.pts.y3)}"
                fill="none"
                stroke={activeRampKey === sh.key ? color : '#5a6270'}
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
        {/each}
      </div>
    </Section>
    <Section label="CYCLE" {color}>
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each [{ l: '1BT', val: 7 }, { l: '2BT', val: 21 }, { l: '1BR', val: 36 }, { l: '2BR', val: 50 }, { l: '4BR', val: 64 }, { l: '6BR', val: 79 }, { l: '8BR', val: 93 }] as v, i (v.l)}
          <RackBtn
            label={v.l}
            active={Math.min(6, Math.floor(lenP * 7 / 100)) === i}
            {color}
            width={28}
            onclick={() => onUpdate('len', v.val)}
          />
        {/each}
      </div>
    </Section>
    <Section label="RANGE" {color} noBorder>
      <div style="display:flex;align-items:center;justify-content:space-around;gap:6px">
        <div style="display:flex;align-items:center;gap:5px">
          <Knob knobId="{moduleId}-spdMin" label="MIN" value={params.spdMin ?? 25} onChange={(v) => onUpdate('spdMin', v)} size="xs" {color} />
          <MiniDisplay value={`${achievedRange.min.toFixed(2)}x`} width={42} />
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <Knob knobId="{moduleId}-spdMax" label="MAX" value={params.spdMax ?? 75} onChange={(v) => onUpdate('spdMax', v)} size="xs" {color} />
          <MiniDisplay value={`${achievedRange.max.toFixed(2)}x`} width={42} />
        </div>
      </div>
    </Section>
  </div>
{:else if moduleId === 'tapdelay'}
  <div style="display:flex;flex-direction:column;flex:1">
    <!--
      Only three of TAPDELAY's ten params reach anything: time, feedback and
      feel. TYPE (Pan/Stutter/Filter) is never mapped in paramsForGpu, and
      velCrv (RPT), scratchMode + scratchDepth (SCR) and end (SENS) have zero
      references outside this file and the preset table — they wrote to a store
      nobody read. Six sections of controls, three of them inert, on the tallest
      card in the rack. What is left is what the module actually does.
    -->
    <Section label="LEN" {color}>
      <div style="display:flex;gap:2px;align-items:center;min-width:0">
        {#each [{ l: '1/32', val: 10 }, { l: '1/16', val: 30 }, { l: '1/8T', val: 50 }, { l: '1/8', val: 70 }, { l: '1/4', val: 90 }] as v (v.l)}
          <RackBtn
            label={v.l}
            active={Math.abs((params.time ?? 60) - v.val) <= 10}
            {color}
            width={30}
            onclick={() => onUpdate('time', v.val)}
          />
        {/each}
      </div>
    </Section>
    <Section label="FEEL" {color}>
      <div style="display:flex;gap:3px;align-items:center;min-width:0">
        {#each [{ l: 'STR8', v: 0 }, { l: 'SWNG', v: 1 }, { l: 'DOT', v: 2 }] as o (o.l)}
          {@const on = Math.round(params.feel ?? 0) === o.v}
          <button
            type="button"
            class="feel-btn"
            title={o.l}
            aria-pressed={on}
            style="border-color:{on ? color + '66' : '#0e1012'};background:{on
              ? `linear-gradient(180deg,${color}22,${color}11)`
              : '#191b1d'};color:{on ? color : '#3a4050'}"
            onclick={() => onUpdate('feel', o.v)}
          >
            <FeelGlyph kind={o.l} {color} dim={!on} />
            <span class="feel-btn-label">{o.l}</span>
          </button>
        {/each}
      </div>
    </Section>
    <Section label="GATE" {color}>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:30px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">LEN</span>
          <div style="flex:1">
            <HSlider value={params.gate ?? 70} onChange={(v) => onUpdate('gate', v)} {color} ariaLabel="GATE LENGTH" controlId="{moduleId}-gate" />
          </div>
          <MiniDisplay value={`${Math.round(params.gate ?? 70)}%`} width={34} />
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:30px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SENS</span>
          <div style="flex:1">
            <HSlider value={params.sens ?? 40} onChange={(v) => onUpdate('sens', v)} {color} ariaLabel="ENERGY SENSITIVITY" controlId="{moduleId}-sens" />
          </div>
          <MiniDisplay value={`${Math.round(params.sens ?? 40)}%`} width={34} />
        </div>
      </div>
    </Section>
    <!-- The param key stays `feedback` so presets keep working; the label is
         HOLD because the module freezes a frame rather than feeding one back. -->
    <Section label="HOLD" {color} noBorder>
      <div style="display:flex;align-items:center;gap:4px">
        <div style="flex:1">
          <HSlider value={params.feedback ?? 50} onChange={(v) => onUpdate('feedback', v)} {color} ariaLabel="HOLD" controlId="{moduleId}-feedback" />
        </div>
        <MiniDisplay value={`${Math.round(params.feedback ?? 50)}%`} width={34} />
      </div>
    </Section>
  </div>
{:else if moduleId === 'timesampler'}
  <div style="display:flex;flex-direction:column;flex:1">
    <Section label="MODE" {color}>
      <div style="display:flex;gap:2px;align-items:center">
        {#each [{ l: 'FWD', v: 0 }, { l: 'REV', v: 1 }, { l: 'PONG', v: 2 }, { l: 'RND', v: 3 }] as o (o.l)}
          <RackBtn
            label={o.l}
            active={Math.round(params.mode ?? 0) === o.v}
            {color}
            width={32}
            onclick={() => onUpdate('mode', o.v)}
          />
        {/each}
        <div style="width:4px"></div>
        {#each [{ l: 'LUM', v: 0 }, { l: 'RGB', v: 1 }, { l: 'OFF', v: 2 }] as o (o.l)}
          <RackBtn
            label={o.l}
            active={Math.round(params.accent ?? 0) === o.v}
            {color}
            width={28}
            onclick={() => onUpdate('accent', o.v)}
          />
        {/each}
      </div>
    </Section>
    <Section label="CHOP" {color}>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">JMP</span>
          <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
            {#each [{ l: '1/16', val: 10 }, { l: '1/8', val: 30 }, { l: '1/4', val: 50 }, { l: '1/2', val: 70 }, { l: 'BAR', val: 90 }] as v (v.l)}
              <RackBtn
                label={v.l}
                active={Math.abs((params.size ?? 50) - v.val) <= 10}
                {color}
                width={28}
                onclick={() => onUpdate('size', v.val)}
              />
            {/each}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SLIC</span>
          <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
            {#each [4, 8, 16, 32] as n (n)}
              <RackBtn
                label={`${n}`}
                active={Math.round(params.slices ?? 8) === n}
                {color}
                width={28}
                onclick={() => onUpdate('slices', n)}
              />
            {/each}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">LOOP</span>
          <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
            {#each [1, 2, 4, 8] as n (n)}
              <RackBtn
                label={`${n}`}
                active={loops === n}
                {color}
                width={28}
                onclick={() => onUpdate('loops', n)}
              />
            {/each}
          </div>
        </div>
      </div>
    </Section>
    <Section label="PLAY" {color} noBorder>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">RATE</span>
          <div style="flex:1">
            <HSlider value={params.rate ?? 43} onChange={(v) => onUpdate('rate', v)} {color} ariaLabel="RATE" controlId="{moduleId}-rate" />
          </div>
          <MiniDisplay value={`${rate.toFixed(2)}×`} width={40} />
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SENS</span>
          <div style="flex:1">
            <HSlider value={params.chance ?? 60} onChange={(v) => onUpdate('chance', v)} {color} ariaLabel="SENSITIVITY" controlId="{moduleId}-chance" />
          </div>
          <MiniDisplay value={`${Math.round(params.chance ?? 60)}%`} width={34} />
        </div>
      </div>
    </Section>
  </div>
{:else if moduleId === 'leak'}
  <div style="display:flex;flex-direction:column;flex:1">
    <!-- Six leak geometries, not three tints of one gradient. `type` is a
         discrete index in the shader, so it matches on the value itself
         rather than on the whole set. -->
    <Section label="TYPE" {color}>
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each [
          // Spread across the whole temperature range, not clustered in the
          // warm half. leakTint splits at 0.5; the first pass put five of six
          // presets above it, so every type came out the same orange and there
          // was no cool option at all. Anamorphic streaks are blue in practice,
          // and a daylight shaft is cooler still.
          { l: 'GATE', set: { type: 0, edge: 45, warmth: 66, drift: 30 } },
          { l: 'STREAK', set: { type: 1, edge: 60, warmth: 28, drift: 35 } },
          { l: 'SHAFT', set: { type: 2, edge: 40, warmth: 14, drift: 55 } },
          { l: 'CORNER', set: { type: 3, edge: 55, warmth: 84, drift: 25 } },
          { l: 'BURN', set: { type: 4, edge: 50, warmth: 96, drift: 40 } },
          { l: 'VEIL', set: { type: 5, edge: 35, warmth: 44, drift: 30 } }
        ] as p (p.l)}
          {@const active = Math.round(params.type ?? 0) === p.set.type}
          <RackBtn
            label={p.l}
            {active}
            {color}
            width={40}
            onclick={() => Object.entries(p.set).forEach(([k, v]) => onUpdate(k, v))}
          />
        {/each}
      </div>
    </Section>
    <Section label="FX" {color} noBorder>
      <div style="display:flex;flex-direction:column;gap:4px">
        <HSlider
          value={params.edge ?? 50}
          onChange={(v) => onUpdate('edge', v)}
          {color}
          label="EDGE"
          controlId="{moduleId}-edge"
        />
        <HSlider
          value={params.warmth ?? 60}
          onChange={(v) => onUpdate('warmth', v)}
          {color}
          label="WARMTH"
          controlId="{moduleId}-warmth"
        />
        <HSlider
          value={params.drift ?? 35}
          onChange={(v) => onUpdate('drift', v)}
          {color}
          label="DRIFT"
          controlId="{moduleId}-drift"
        />
      </div>
    </Section>
  </div>
{:else if moduleId === 'streak'}
  <div style="display:flex;flex-direction:column;flex:1">
    <Section label="PRESET" {color}>
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each [
          { l: 'H-SMR', set: { length: 40, angle: 10, decay: 45 } },
          { l: 'DIAG', set: { length: 60, angle: 45, decay: 50 } },
          { l: 'LONG', set: { length: 85, angle: 25, decay: 35 } }
        ] as p (p.l)}
          {@const active = Object.entries(p.set).every(
            ([k, v]) => Math.abs((params[k] ?? -999) - v) <= 9
          )}
          <RackBtn
            label={p.l}
            {active}
            {color}
            width={36}
            onclick={() => Object.entries(p.set).forEach(([k, v]) => onUpdate(k, v))}
          />
        {/each}
      </div>
    </Section>
    <Section label="FX" {color} noBorder>
      <div style="display:flex;flex-direction:column;gap:4px">
        <HSlider
          value={params.length ?? 50}
          onChange={(v) => onUpdate('length', v)}
          {color}
          label="LENGTH"
          controlId="{moduleId}-length"
        />
        <HSlider
          value={params.angle ?? 35}
          onChange={(v) => onUpdate('angle', v)}
          {color}
          label="ANGLE"
          controlId="{moduleId}-angle"
        />
        <HSlider
          value={params.decay ?? 45}
          onChange={(v) => onUpdate('decay', v)}
          {color}
          label="DECAY"
          controlId="{moduleId}-decay"
        />
      </div>
    </Section>
  </div>
{:else}
  <div style="display:flex;flex-direction:column;flex:1;padding:6px 7px;gap:6px">
    <Section label="FX" {color} noBorder>
      <div style="display:flex;flex-direction:column;gap:4px">
        {#each Object.keys(params).filter((k) => k !== 'mix' && k !== 'in_' && k !== 'out') as key (key)}
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:36px;flex-shrink:0;font-size:7px;font-weight:500;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em;text-transform:uppercase">{key.slice(0, 4)}</span>
            <div style="flex:1">
              <HSlider value={params[key] ?? 50} onChange={(v) => onUpdate(key, v)} {color} ariaLabel={key} controlId="{moduleId}-{key}" />
            </div>
          </div>
        {/each}
      </div>
    </Section>
  </div>
{/if}

<style>
  /* Taller than the 16px control tier because it carries a rhythm diagram as
     well as a label -- the same trade INCEPTION's fold buttons make. */
  .feel-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 2px;
    border-style: solid;
    border-width: 1px;
    border-radius: 2px;
    cursor: pointer;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
    transition: background 0.08s, border-color 0.08s;
  }
  .feel-btn:hover {
    background: #1e2022 !important;
  }
  .feel-btn-label {
    font-family: var(--font-ui);
    font-size: 5.5px;
    font-weight: 500;
    letter-spacing: 0.06em;
    line-height: 1;
  }
</style>