<script lang="ts">
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import { getModuleDef } from '$lib/modules/catalog';
  import { sequencerArmed } from '$lib/stores/sequencer';
  import { transportDisplay } from '$lib/stores/transportDisplay';
  import { rackTop, rackBottom, MAX_RACK_SLOTS_PER_ROW } from '$lib/stores/rack';
  import {
    ARRANGEMENT_STEPS,
    activeSection,
    activeSectionIndex,
    arrangement,
    arrangementTotalBars,
    autoBank,
    barInSection,
    clearActiveSectionPattern,
    moduleForSlotIndex,
    paintSlotIndex,
    selectSection,
    toggleArrangementStep
  } from '$lib/stores/arrangement';

  // Closed by default. Open, the dock is 129px, and with both rack rows expanded
  // the column already totals 1324px against a 1290px window — the step grid's
  // last row falls below the fold on the machine this is built on. The header
  // stays visible either way, so the panel is still findable; opening it is a
  // deliberate act, and MIN ALL frees 441px to open it into.
  let open = $state(false);

  const slotCount = $derived($rackTop.length + $rackBottom.length);

  /** Playhead: only runs when the sequencer is actually driving cuts. */
  const activeStep = $derived(
    $sequencerArmed && $transportDisplay.playing
      ? Math.floor($transportDisplay.beat * 4) % ARRANGEMENT_STEPS
      : -1
  );

  function slotLabel(slotIndex: number) {
    const id = moduleForSlotIndex($rackTop, $rackBottom, slotIndex);
    const def = id ? getModuleDef(id) : undefined;
    return def ? { name: def.shortName, color: def.accentColor } : null;
  }

  function slotDisplayName(slotIndex: number) {
    return slotIndex < MAX_RACK_SLOTS_PER_ROW
      ? `A${slotIndex + 1}`
      : `B${slotIndex - MAX_RACK_SLOTS_PER_ROW + 1}`;
  }
</script>

<section class="seq-dock" class:is-open={open}>
  <div class="seq-head">
    <button
      type="button"
      class="seq-collapse"
      onclick={() => (open = !open)}
      aria-label={open ? 'Collapse sequencer' : 'Expand sequencer'}
    >
      {#if open}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}
    </button>
    <span class="seq-title">ARRANGE · SEQ</span>

    <button
      type="button"
      class="seq-btn"
      data-active={$sequencerArmed}
      onclick={() => sequencerArmed.update((v) => !v)}
    >{$sequencerArmed ? 'ARMED' : 'OFF'}</button>

    <button
      type="button"
      class="seq-btn seq-btn-bank"
      data-active={$autoBank}
      onclick={() => autoBank.update((v) => !v)}
      title="Entering a section rebuilds the rack from that section's FX bank"
    >AUTO-BANK</button>

    <button type="button" class="seq-btn" onclick={clearActiveSectionPattern}>CLR</button>

    <span class="seq-hint">
      click a step to paint slot {slotDisplayName($paintSlotIndex)} · sections recall their own FX bank
    </span>

    <div class="seq-readout">
      <span style="color:{$activeSection?.hue}">{$activeSection?.name}</span>
      <span>BAR {$barInSection + 1}/{$activeSection?.bars}</span>
      <span>{$arrangementTotalBars} BARS TOTAL</span>
    </div>
  </div>

  {#if open}
    <!-- Arrangement: each section's width is its share of the song, so the strip
         reads as a timeline rather than as equal-sized tabs. -->
    <div class="seq-arrangement">
      {#each $arrangement as section, i (section.id)}
        {@const on = i === $activeSectionIndex}
        {@const pct = on ? Math.min(100, ($barInSection / section.bars) * 100) : 0}
        <button
          type="button"
          class="seq-section"
          data-active={on}
          style="flex-grow:{section.bars};{on
            ? `background:${section.hue}1f;box-shadow:inset 0 0 0 1px ${section.hue}88`
            : ''}"
          onclick={() => selectSection(i)}
          title="{section.name} — {section.bars} bars"
        >
          <span class="seq-section-fill" style="width:{pct}%"></span>
          <span class="seq-section-body">
            <span class="seq-section-tick" style="background:{section.hue}"></span>
            <span class="seq-section-name" style="color:{on ? section.hue : '#7d9196'}">
              {section.name}
            </span>
            <span class="seq-section-bars">{section.bars}b</span>
          </span>
        </button>
      {/each}
    </div>

    <div class="seq-paint">
      <span class="seq-paint-label">PAINT</span>
      {#each Array(slotCount) as _, slotIndex (slotIndex)}
        {@const info = slotLabel(slotIndex)}
        <button
          type="button"
          class="seq-paint-slot"
          data-active={$paintSlotIndex === slotIndex}
          style={$paintSlotIndex === slotIndex && info
            ? `border-color:${info.color};background:${info.color}22;color:${info.color}`
            : ''}
          onclick={() => paintSlotIndex.set(slotIndex)}
          title="Paint {info?.name ?? 'empty'} (slot {slotDisplayName(slotIndex)})"
        >{slotDisplayName(slotIndex)}</button>
      {/each}
    </div>

    <div class="seq-grid">
      {#each $activeSection?.pattern ?? [] as slotIndex, i (i)}
        {@const info = slotIndex != null ? slotLabel(slotIndex) : null}
        {@const lit = activeStep === i}
        <button
          type="button"
          class="seq-step"
          class:is-downbeat={slotIndex == null && i % 4 === 0}
          style={info ? `background:${info.color}1f;box-shadow:inset 0 0 0 1px ${info.color}88` : ''}
          onclick={() => toggleArrangementStep(i, $paintSlotIndex)}
          title={info ? `Step ${i + 1} — ${info.name}` : `Step ${i + 1} — empty`}
        >
          <span class="seq-step-num">{String(i + 1).padStart(2, '0')}</span>
          {#if info && slotIndex != null}
            <span class="seq-step-body">
              <span class="seq-step-fx" style="color:{info.color}">{info.name}</span>
              <span class="seq-step-slot">{slotDisplayName(slotIndex)}</span>
            </span>
          {/if}
          <span class="seq-step-head" data-lit={lit}></span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .seq-dock {
    flex-shrink: 0;
    background: linear-gradient(180deg, #0e1012, #0a0b0c);
    border-top: 2px solid #0d0e0f;
  }

  .seq-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
  }

  .seq-collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: linear-gradient(180deg, #1c1e22, #141618);
    color: #4a5260;
    cursor: pointer;
  }
  .seq-collapse:hover {
    color: #cfe0e2;
  }

  .seq-title {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: #556070;
    white-space: nowrap;
  }

  .seq-btn {
    height: 16px;
    padding: 0 6px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.1em;
    cursor: pointer;
    white-space: nowrap;
  }
  .seq-btn[data-active='true'] {
    border-color: #22c55e55;
    background: #22c55e18;
    color: #4ade80;
  }
  .seq-btn-bank[data-active='true'] {
    border-color: #9d7bff55;
    background: #9d7bff18;
    color: #b79dff;
  }

  .seq-hint {
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.1em;
    color: #33383f;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seq-readout {
    margin-left: auto;
    display: flex;
    gap: 10px;
    font-family: var(--font-ui);
    font-size: 8px;
    letter-spacing: 0.12em;
    color: #4a5260;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .seq-arrangement {
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 0 8px 5px;
  }

  .seq-section {
    position: relative;
    flex-basis: 0;
    min-width: 0;
    height: 24px;
    overflow: hidden;
    padding: 0;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    background: #101214;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }
  .seq-section:hover {
    background: #16181b;
  }
  /* Progress runs under the label so the section fills as its bars elapse. */
  .seq-section-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.06);
    transition: width 0.15s linear;
  }
  .seq-section-body {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 100%;
    padding: 0 6px;
  }
  .seq-section-tick {
    width: 2px;
    height: 11px;
    flex-shrink: 0;
    border-radius: 1px;
  }
  .seq-section-name {
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 500;
    letter-spacing: 0.12em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seq-section-bars {
    margin-left: auto;
    font-family: var(--font-ui);
    font-size: 7px;
    color: #55696e;
    font-variant-numeric: tabular-nums;
  }

  .seq-paint {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px 5px;
  }
  .seq-paint-label {
    font-family: var(--font-ui);
    font-size: 7px;
    letter-spacing: 0.14em;
    color: #33383f;
    margin-right: 3px;
  }
  .seq-paint-slot {
    height: 16px;
    min-width: 22px;
    padding: 0 4px;
    border: 1px solid #1e2226;
    border-radius: 2px;
    background: #131517;
    color: #4a5260;
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .seq-paint-slot:hover {
    color: #cfe0e2;
  }

  .seq-grid {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 3px;
    padding: 0 8px 7px;
  }

  .seq-step {
    position: relative;
    height: 44px;
    overflow: hidden;
    padding: 0;
    border: 1px solid #1a1c1e;
    border-radius: 2px;
    background: #101214;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, transform 0.12s;
  }
  .seq-step:hover {
    background: #1a1c1f;
    transform: translateY(-1px);
  }
  /* Quarter-note anchors, so 16 steps read as four beats at a glance. */
  .seq-step.is-downbeat {
    background: #141618;
  }
  .seq-step-num {
    position: absolute;
    top: 2px;
    left: 3px;
    font-family: var(--font-mono);
    font-size: 6px;
    color: #55696e;
    font-variant-numeric: tabular-nums;
  }
  .seq-step-body {
    position: absolute;
    inset: auto 3px 3px;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .seq-step-fx {
    font-family: var(--font-ui);
    font-size: 7px;
    font-weight: 500;
    letter-spacing: 0.06em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seq-step-slot {
    font-family: var(--font-ui);
    font-size: 6px;
    color: #6d8288;
  }
  .seq-step-head {
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: transparent;
    transition: background 0.08s;
  }
  .seq-step-head[data-lit='true'] {
    background: #35e08a;
    box-shadow: 0 0 8px #35e08a;
  }
</style>
