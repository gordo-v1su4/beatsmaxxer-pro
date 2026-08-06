<script lang="ts">
  import { listCatalog } from '$lib/modules/catalog';
  import { sequencerSteps, sequencerArmed, toggleSequencerStep, clearSequencer } from '$lib/stores/sequencer';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { rackTop, rackBottom } from '$lib/stores/rack';

  const modules = $derived(
    listCatalog().filter((m) => [...$rackTop, ...$rackBottom].includes(m.id))
  );

  // The running playhead is part of being armed. Left ungated it kept chasing
  // the beat on an idle sequencer, which is motion with nothing behind it.
  const activeStep = $derived(
    $sequencerArmed && $transportDisplay.playing
      ? Math.floor($transportDisplay.beat * 4) % 16
      : -1
  );

  let paintModule = $state<string | null>(null);

  function onStepClick(index: number) {
    toggleSequencerStep(index, paintModule ?? modules[0]?.id ?? null);
  }
</script>

<section
  style="flex-shrink:0;background:linear-gradient(180deg,#0e1012,#0a0b0c);border-top:2px solid #0d0e0f;padding:6px 8px;display:flex;flex-direction:column;gap:6px"
>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:500;letter-spacing:0.16em;color:#556070">BEAT SEQ</span>
      <button
        type="button"
        onclick={() => sequencerArmed.update((v) => !v)}
        style="height:18px;padding:0 6px;border-radius:2px;border:1px solid {$sequencerArmed ? '#22c55e55' : '#1e2226'};background:{$sequencerArmed ? '#22c55e18' : '#131517'};color:{$sequencerArmed ? '#4ade80' : '#4a5260'};font-size:7px;font-weight:500;letter-spacing:0.1em;cursor:pointer"
      >
        {$sequencerArmed ? 'ARMED' : 'OFF'}
      </button>
      <button
        type="button"
        onclick={clearSequencer}
        style="height:18px;padding:0 6px;border-radius:2px;border:1px solid #1e2226;background:#131517;color:#4a5260;font-size:7px;font-weight:500;cursor:pointer"
      >
        CLR
      </button>
    </div>
    <div style="display:flex;gap:3px;flex-wrap:wrap">
      {#each modules as mod (mod.id)}
        <button
          type="button"
          title={mod.name}
          onclick={() => (paintModule = mod.id)}
          style="width:16px;height:16px;border-radius:2px;border:1px solid {paintModule === mod.id ? mod.accentColor : '#1e2226'};background:{paintModule === mod.id ? mod.accentColor + '33' : '#131517'};cursor:pointer"
        ></button>
      {/each}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(16,1fr);gap:3px">
    {#each $sequencerSteps as step, i (i)}
      {@const mod = step ? modules.find((m) => m.id === step) : null}
      {@const lit = activeStep === i}
      <button
        type="button"
        onclick={() => onStepClick(i)}
        style="height:28px;border-radius:2px;border:1px solid {lit ? (mod?.accentColor ?? '#38bdf8') + 'aa' : step ? (mod?.accentColor ?? '#556070') + '55' : '#1a1c1e'};background:{lit
          ? `linear-gradient(180deg,${mod?.accentColor ?? '#38bdf8'}44,${mod?.accentColor ?? '#38bdf8'}18)`
          : step
            ? `linear-gradient(180deg,${mod?.accentColor ?? '#556070'}28,${mod?.accentColor ?? '#556070'}10)`
            : 'linear-gradient(180deg,#141618,#101214)'};box-shadow:{lit ? `0 0 8px ${mod?.accentColor ?? '#38bdf8'}44` : 'inset 0 1px 2px rgba(0,0,0,0.5)'};cursor:pointer;transition:all 0.05s"
      >
        <span style="font-family:var(--font-mono);font-size:6px;color:{lit ? '#e5e7eb' : '#3a4050'}">{i + 1}</span>
      </button>
    {/each}
  </div>
  <span style="font-size:7px;color:#33383f;letter-spacing:0.08em">16 steps · sixteenth notes · paints PGM cuts on active steps</span>
</section>
