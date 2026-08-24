<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, RefreshCw } from '@lucide/svelte';
  import TopBtn from '$lib/components/rack/TopBtn.svelte';
  import { isTauriRuntime } from '$lib/platform/runtime';
  import {
    downloadPercent,
    loadDesktopUpdaterAdapter,
    reduceDownloadProgress,
    type DesktopUpdaterAdapter,
    type DownloadProgress
  } from '$lib/platform/desktopUpdater';
  import type { Update } from '@tauri-apps/plugin-updater';

  type UpdatePhase =
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'installing'
    | 'error';

  const EMPTY_PROGRESS: DownloadProgress = {
    downloadedBytes: 0,
    finished: false
  };

  let visible = $state(false);
  let phase = $state<UpdatePhase>('idle');
  let installedVersion = $state('');
  let pendingUpdate = $state<Update | null>(null);
  let progress = $state<DownloadProgress>({ ...EMPTY_PROGRESS });
  let errorMessage = $state('');
  let adapter: DesktopUpdaterAdapter | null = null;

  const percent = $derived(downloadPercent(progress));
  const label = $derived.by(() => {
    switch (phase) {
      case 'checking':
        return 'CHECKING';
      case 'current':
        return installedVersion ? `CURRENT·${installedVersion}` : 'CURRENT';
      case 'available':
        return `UPDATE·${pendingUpdate?.version ?? ''}`;
      case 'downloading':
        return percent === null ? 'DOWNLOADING' : `DL·${percent}%`;
      case 'installing':
        return 'INSTALLING';
      case 'error':
        return 'RETRY';
      default:
        return 'UPDATE';
    }
  });
  const busy = $derived(phase === 'checking' || phase === 'downloading' || phase === 'installing');
  const title = $derived.by(() => {
    if (phase === 'error') return `Update failed: ${errorMessage}. Click to retry.`;
    if (phase === 'available') {
      const notes = pendingUpdate?.body?.trim();
      return notes
        ? `Install Beatsmaxxer Pro ${pendingUpdate?.version}: ${notes}`
        : `Install Beatsmaxxer Pro ${pendingUpdate?.version}`;
    }
    if (phase === 'current') return `Beatsmaxxer Pro ${installedVersion} is current. Click to check again.`;
    return 'Check GitHub Releases for a Beatsmaxxer Pro desktop update';
  });

  async function checkForUpdate() {
    phase = 'checking';
    errorMessage = '';
    pendingUpdate = null;
    progress = { ...EMPTY_PROGRESS };
    try {
      adapter ??= await loadDesktopUpdaterAdapter();
      pendingUpdate = await adapter.check();
      phase = pendingUpdate ? 'available' : 'current';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      phase = 'error';
    }
  }

  async function installUpdate() {
    if (!pendingUpdate || !adapter) return;
    phase = 'downloading';
    progress = { ...EMPTY_PROGRESS };
    errorMessage = '';
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        progress = reduceDownloadProgress(progress, event);
        if (event.event === 'Finished') phase = 'installing';
      });
      phase = 'installing';
      await adapter.relaunch();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      phase = 'error';
    }
  }

  function handleClick() {
    if (phase === 'available') {
      void installUpdate();
    } else if (!busy) {
      void checkForUpdate();
    }
  }

  onMount(() => {
    if (!isTauriRuntime()) return;
    visible = true;
    void (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        installedVersion = await getVersion();
      } catch {
        // The updater still reports currentVersion; version text is optional UI context.
      }
      await checkForUpdate();
    })();
  });
</script>

{#if visible}
  <div class="desktop-updater" data-phase={phase} aria-live="polite">
    <TopBtn
      {label}
      {title}
      accent={phase === 'available'}
      active={phase === 'available'}
      disabled={busy}
      onclick={handleClick}
    >
      {#snippet icon()}
        {#if busy}<RefreshCw size={10} class="spin" />{:else}<Download size={10} />{/if}
      {/snippet}
    </TopBtn>
  </div>
{/if}

<style>
  .desktop-updater {
    display: contents;
  }

  :global(.desktop-updater .spin) {
    animation: updater-spin 0.9s linear infinite;
  }

  @keyframes updater-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
