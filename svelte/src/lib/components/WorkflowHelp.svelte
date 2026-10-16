<script lang="ts">
  import { onMount } from 'svelte';
  import { workflowHelpOpen, workflowHelpTopic } from '$lib/stores/workflowHelp';
  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} aria-labelledby="workflow-help-title" onclose={() => workflowHelpOpen.set(false)}>
  <header>
    <div><span>BEATSMAXXER PRO / DOCS</span><h1 id="workflow-help-title">From clips to a finished edit</h1></div>
    <button type="button" onclick={() => dialog.close()} aria-label="Close workflow help">Back to decks <span aria-hidden="true">×</span></button>
  </header>
  <iframe src={`/help/quick-guide.html#${$workflowHelpTopic}`} title="Beatsmaxxer workflow diagrams and Timing explanations"></iframe>
</dialog>

<style>
  dialog{position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#0d1012;color:#dce5e8}
  dialog[open]{display:flex;flex-direction:column}
  header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 32px;border-bottom:0;background:#151d20;flex-shrink:0}
  header div>span{font:10px var(--font-ui);color:#9aa9b0}
  h1{margin:5px 0 0;font:600 20px system-ui,sans-serif;letter-spacing:-.025em}
  button{display:flex;align-items:center;gap:18px;border:0;border-radius:4px;padding:10px 15px;background:#24473d;color:#d5f5e7;font:12px system-ui,sans-serif;cursor:pointer;min-height:44px}
  button:focus-visible{outline:2px solid #99f6e4;outline-offset:3px}
  button span{font-size:20px;line-height:1}
  iframe{width:100%;flex:1;min-height:0;border:0}
  @media(max-width:600px){header{padding:16px;gap:12px}h1{font-size:16px}button{padding:8px;font-size:11px;gap:8px}}
</style>
