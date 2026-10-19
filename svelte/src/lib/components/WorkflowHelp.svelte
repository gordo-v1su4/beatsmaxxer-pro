<script lang="ts">
  import { onMount } from 'svelte';
  import { workflowHelpOpen, workflowHelpTopic } from '$lib/stores/workflowHelp';
  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} aria-labelledby="workflow-help-title" onclose={() => workflowHelpOpen.set(false)}>
  <header>
    <div><span>BEATSMAXXER PRO / HELP</span><h1 id="workflow-help-title">Know your next step</h1></div>
    <button type="button" onclick={() => dialog.close()} aria-label="Close workflow help">Back to decks <span aria-hidden="true">×</span></button>
  </header>
  <iframe src={`/help/quick-guide.html#${$workflowHelpTopic}`} title="Beatsmaxxer workflow diagrams and Timing explanations"></iframe>
</dialog>

<style>
  dialog{position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#0d1012;color:#dce5e8}
  dialog[open]{display:flex;flex-direction:column}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 18px;background:#111316;flex-shrink:0}
  header div>span{font:8px var(--font-ui);color:#9aa9b0;letter-spacing:.1em}
  h1{margin:2px 0 0;font:600 13px var(--font-ui);letter-spacing:.025em}
  button{display:flex;align-items:center;gap:12px;border:0;border-radius:2px;padding:4px 10px;background:#17302b;color:#99f6e4;font:10px var(--font-ui);cursor:pointer;min-height:24px}
  button:focus-visible{outline:2px solid #99f6e4;outline-offset:3px}
  button span{font-size:15px;line-height:1}
  iframe{width:100%;flex:1;min-height:0;border:0}
  @media(max-width:600px){header{padding:6px 12px;gap:8px}h1{font-size:12px}button{padding:4px 8px;font-size:10px;gap:8px}}
</style>
