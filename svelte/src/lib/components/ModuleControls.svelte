<script lang="ts">
  import Knob from '$lib/components/Knob.svelte';
  import Section from './rack/Section.svelte';
  import RackBtn from './rack/RackBtn.svelte';
  import HSlider from './rack/HSlider.svelte';
  import MiniDisplay from './rack/MiniDisplay.svelte';

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
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px">
        {#each TRANSITION_PACK as o (o.l)}
          <RackBtn
            label={o.l}
            active={Math.round(params.type ?? 0) === o.v}
            {color}
            width={34}
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
          <MiniDisplay value={`${rampSpeed(params.spdMin ?? 25)}x`} width={42} />
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <Knob knobId="{moduleId}-spdMax" label="MAX" value={params.spdMax ?? 75} onChange={(v) => onUpdate('spdMax', v)} size="xs" {color} />
          <MiniDisplay value={`${rampSpeed(params.spdMax ?? 75)}x`} width={42} />
        </div>
      </div>
    </Section>
  </div>
{:else if moduleId === 'tapdelay'}
  <div style="display:flex;flex-direction:column;flex:1">
    <Section label="TYPE" {color}>
      <div style="display:flex;gap:2px">
        {#each ['Pan', 'Stutter', 'Filter'] as t, i (t)}
          <RackBtn
            label={t}
            active={Math.round(params.type ?? 0) === i}
            {color}
            width={i === 1 ? 44 : 34}
            onclick={() => onUpdate('type', i)}
          />
        {/each}
      </div>
    </Section>
    {#if stutterMode}
      <Section label="STUT" {color}>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">LEN</span>
            <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
              {#each [{ l: '1/32', val: 10 }, { l: '1/16', val: 30 }, { l: '1/8T', val: 50 }, { l: '1/8', val: 70 }, { l: '1/4', val: 90 }] as v (v.l)}
                <RackBtn
                  label={v.l}
                  active={Math.abs((params.time ?? 60) - v.val) <= 10}
                  {color}
                  width={28}
                  onclick={() => onUpdate('time', v.val)}
                />
              {/each}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">RPT</span>
            <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
              {#each [1, 2, 4, 6, 8] as n (n)}
                {@const currentRepeats = Math.round((params.velCrv ?? 25) / 100 * 8) || 1}
                <RackBtn
                  label={`${n}×`}
                  active={currentRepeats === n}
                  {color}
                  width={28}
                  onclick={() => onUpdate('velCrv', (n / 8) * 100)}
                />
              {/each}
              <div style="width:4px"></div>
              {#each [{ l: 'STR8', v: 0 }, { l: 'SWNG', v: 1 }, { l: 'DOT', v: 2 }] as o (o.l)}
                <RackBtn
                  label={o.l}
                  active={Math.round(params.feel ?? 0) === o.v}
                  {color}
                  width={28}
                  onclick={() => onUpdate('feel', o.v)}
                />
              {/each}
            </div>
          </div>
        </div>
      </Section>
      <Section label="SCR" {color}>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">MODE</span>
          <div style="display:flex;gap:2px;flex:1;align-items:center;min-width:0">
            {#each [{ l: 'BEAT', v: 0 }, { l: 'LOOP', v: 1 }, { l: 'PONG', v: 2 }, { l: 'RND', v: 3 }] as o (o.l)}
              <RackBtn
                label={o.l}
                active={Math.round(params.scratchMode ?? 0) === o.v}
                {color}
                width={30}
                onclick={() => onUpdate('scratchMode', o.v)}
              />
            {/each}
            <div style="flex:1;min-width:36px">
              <HSlider
                value={params.scratchDepth ?? 45}
                onChange={(v) => onUpdate('scratchDepth', v)}
                {color}
                ariaLabel="SCRATCH DEPTH"
                controlId="{moduleId}-scratchDepth"
              />
            </div>
          </div>
        </div>
      </Section>
      <Section label="TRIG" {color} noBorder>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SENS</span>
          <div style="flex:1">
            <HSlider value={params.end ?? 60} onChange={(v) => onUpdate('end', v)} {color} ariaLabel="SENSITIVITY" controlId="{moduleId}-end" />
          </div>
          <MiniDisplay value={`${Math.round(params.end ?? 60)}%`} width={34} />
        </div>
      </Section>
    {:else}
      <Section label="TIME" {color}>
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">TIME</span>
            <div style="flex:1">
              <HSlider value={params.time ?? 60} onChange={(v) => onUpdate('time', v)} {color} ariaLabel="TIME" controlId="{moduleId}-time" />
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">FDBK</span>
            <div style="flex:1">
              <HSlider value={params.feedback ?? 50} onChange={(v) => onUpdate('feedback', v)} {color} ariaLabel="FEEDBACK" controlId="{moduleId}-feedback" />
            </div>
          </div>
        </div>
      </Section>
      <Section label="TRIG" {color} noBorder>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SENS</span>
          <div style="flex:1">
            <HSlider value={params.end ?? 60} onChange={(v) => onUpdate('end', v)} {color} ariaLabel="SENSITIVITY" controlId="{moduleId}-end" />
          </div>
          <MiniDisplay value={`${Math.round(params.end ?? 60)}%`} width={34} />
        </div>
      </Section>
    {/if}
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
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">JMP</span>
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
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SLIC</span>
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
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">LOOP</span>
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
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">RATE</span>
          <div style="flex:1">
            <HSlider value={params.rate ?? 43} onChange={(v) => onUpdate('rate', v)} {color} ariaLabel="RATE" controlId="{moduleId}-rate" />
          </div>
          <MiniDisplay value={`${rate.toFixed(2)}×`} width={40} />
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="width:32px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em">SENS</span>
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
    <Section label="PRESET" {color}>
      <div style="display:flex;gap:2px;flex-wrap:wrap">
        {#each [
          { l: 'WARM', set: { edge: 45, warmth: 55, drift: 30 } },
          { l: 'FLARE', set: { edge: 75, warmth: 85, drift: 50 } },
          { l: 'BLEED', set: { edge: 25, warmth: 40, drift: 20 } }
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
            <span style="width:36px;flex-shrink:0;font-size:7px;font-weight:700;color:#3a4050;font-family:var(--font-ui);letter-spacing:0.08em;text-transform:uppercase">{key.slice(0, 4)}</span>
            <div style="flex:1">
              <HSlider value={params[key] ?? 50} onChange={(v) => onUpdate(key, v)} {color} ariaLabel={key} controlId="{moduleId}-{key}" />
            </div>
          </div>
        {/each}
      </div>
    </Section>
  </div>
{/if}
