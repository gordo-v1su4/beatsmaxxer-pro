<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
</script>

<svelte:head>
  <title>Beat Surfer Pro</title>
  <link rel="icon" href={favicon} type="image/svg+xml" />
  <link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{@render children()}
