<script lang="ts">
  type View = 'frame' | 'relay';
  type Stage = { id: string; title: string; label: string; body: string; x: number; y: number };
  const frame: Stage[] = [
    { id: 'video', title: 'Ten slots', label: 'Video decoders', x: 0, y: 36, body: 'Each rack slot owns its video file and decoder. Changing an effect does not reload the clip. The program monitor reads an existing slot instead of starting an eleventh decoder.' },
    { id: 'import', title: 'Import a frame', label: 'GPU texture', x: 21, y: 36, body: 'WebGpuEngine imports the current video frame as an external GPU texture and uses it in the same task. It does not hold that external texture for the next frame. If a frame is unavailable, it can display the idle test card.' },
    { id: 'shader', title: 'Apply the effect', label: 'WGSL shader', x: 42, y: 36, body: 'A shared shader program contains the effect catalog. The selected effect, its knobs, beat phase, and bypass state all read from the same timeline snapshot that drives the audio.' },
    { id: 'feedback', title: 'Remember a frame', label: 'Feedback textures', x: 63, y: 36, body: 'Each canvas has a read texture and a write texture. Effects can use the previous result as feedback. The timeline determines whether that pair advances or resets after a seek, loop, or pause.' },
    { id: 'blit', title: 'Show the picture', label: 'Preview + program', x: 84, y: 36, body: 'Ten previews and the program monitor share one GPU device. The program director changes which slot and effect the program canvas reads, so a cut reuses the video already playing in the rack.' }
  ];
  const relay: Stage[] = [
    { id: 'browser', title: 'Choose analysis', label: 'Your browser', x: 0, y: 36, body: 'The song plays locally. When you choose hosted analysis, an MP3 can take the optional analysis path. WAV files stay local. Playback does not wait for the service to reply.' },
    { id: 'route', title: 'Send the request', label: 'Same-origin route', x: 28, y: 3, body: 'The browser sends the analysis request to a route on the same site. Smaller files can be sent directly; larger files use staged chunks and a small manifest.' },
    { id: 'chunks', title: 'Stage larger files', label: 'Chunk storage', x: 28, y: 36, body: 'The upload path divides a larger MP3 into parts in object storage. The server reassembles the original file for analysis rather than downsampling it.' },
    { id: 'function', title: 'Forward securely', label: 'Server function', x: 56, y: 3, body: 'The dev proxy or server function supplies the analysis credential. It stays on the server, outside the browser bundle. Request policy checks origin, upload limits, and concurrency.' },
    { id: 'essentia', title: 'Read the rhythm', label: 'Essentia', x: 84, y: 3, body: 'The analysis service returns information such as tempo, musical key, confidence, and beat positions. The app validates the result before using it for timing.' },
    { id: 'local', title: 'Keep it local', label: 'Web Audio fallback', x: 28, y: 69, body: 'If hosted analysis is disabled, declined, or fails, local playback continues. Web Audio supplies live beat energy without requiring the analysis service.' }
  ];
  const frameEdges = [['video', 'import'], ['import', 'shader'], ['shader', 'feedback'], ['feedback', 'blit']];
  const relayEdges = [['browser', 'route'], ['browser', 'chunks'], ['browser', 'local'], ['route', 'function'], ['chunks', 'function'], ['function', 'essentia']];
  const owners = [
    ['Cadence', 'AppLoop', 'One animation loop for the whole show.'],
    ['Clock', 'AudioTimeline', 'Transport time comes from the audio clock.'],
    ['Song', 'AudioEngine', 'Playback, pitch processing, and energy stay local.'],
    ['Clips', 'VideoPool', 'Slot-owned video elements supply the pictures.'],
    ['Picture', 'WebGpuEngine', 'One shared GPU device runs the effects.'],
    ['Program cut', 'PgmDirector', 'A beat-aligned switch onto an existing slot.'],
    ['Rhythm service', 'Essentia relay', 'Optional analysis; failure leaves playback running.']
  ];
  let view = $state<View>('frame');
  let selected = $state('shader');
  const stages = $derived(view === 'frame' ? frame : relay);
  const edges = $derived(view === 'frame' ? frameEdges : relayEdges);
  const stage = $derived(stages.find((item) => item.id === selected) ?? stages[0]);
  function selectView(next: View) {
    view = next;
    selected = next === 'frame' ? 'shader' : 'function';
  }
  function connection(from: string, to: string) {
    const a = stages.find((item) => item.id === from)!;
    const b = stages.find((item) => item.id === to)!;
    const x1 = (a.x + 16) * 10;
    const x2 = b.x * 10;
    const y1 = (a.y + 12) * 3;
    const y2 = (b.y + 12) * 3;
    return `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  }
</script>

<svelte:head>
  <title>Inside Beatsmaxxer Pro · Interactive case study</title>
  <meta name="description" content="Explore how Beatsmaxxer Pro turns ten videos and one shared audio clock into a live visual instrument. An interactive guide to the frame path and optional rhythm analysis." />
</svelte:head>

<main class="case-study" aria-label="Beatsmaxxer Pro case study">
  <div class="page">
    <nav aria-label="Case study navigation">
      <a class="wordmark" href="/">Beatsmaxxer Pro</a>
      <a class="open-app" href="/">Open the instrument <span aria-hidden="true">↗</span></a>
    </nav>
    <header>
      <div class="intro">
        <p class="kicker">Interactive case study</p>
        <h1>The picture follows<br />the music.</h1>
        <p class="lede">Ten video slots. One shared clock. Explore how a browser becomes a live visual instrument, from a decoded frame to the program cut.</p>
      </div>
      <div class="clock-note">
        <div class="beat-track" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <strong>One moment. Every output.</strong>
        <p>Audio, video, effects, and cuts read the same timeline snapshot. The picture and the program stay on your machine.</p>
      </div>
    </header>

    <section class="explorer" aria-labelledby="explorer-title">
      <div class="explorer-heading">
        <h2 id="explorer-title">Follow the signal</h2>
        <div class="view-switch" role="group" aria-label="Diagram view">
          <button type="button" aria-pressed={view === 'frame'} onclick={() => selectView('frame')}>Frame path</button>
          <button type="button" aria-pressed={view === 'relay'} onclick={() => selectView('relay')}>Analysis relay</button>
        </div>
      </div>
      <p class="hint">{view === 'frame' ? 'From the clip to the screen. Select a stage to see what happens.' : 'An optional trip to the server. Local playback continues independently.'}</p>
      <div class="pipeline" role="group" aria-label={view === 'frame' ? 'Video frame stages' : 'Audio analysis stages'}>
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          {#each edges as [from, to] (`${from}-${to}`)}
            <path d={connection(from, to)} class:active={from === stage.id || to === stage.id} />
          {/each}
        </svg>
        {#each stages as item (item.id)}
          <button type="button" class="stage" class:selected={item.id === stage.id}
            style:left="{item.x}%" style:top="{item.y}%"
            aria-pressed={item.id === stage.id} aria-controls="stage-explanation"
            onclick={() => selected = item.id}>
            <span class="stage-label">{item.label}</span>
            <strong>{item.title}</strong>
            <span class="stage-dot" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
      <div class="mobile-connections">
        <p>Connected stages</p>
        <ul aria-label="Diagram connections">
          {#each edges as [from, to] (`${from}-${to}`)}
            <li>{stages.find((item) => item.id === from)?.label} <span aria-hidden="true">→</span><span class="sr-only"> connects to </span> {stages.find((item) => item.id === to)?.label}</li>
          {/each}
        </ul>
      </div>
      <div class="reading" id="stage-explanation" aria-live="polite" aria-atomic="true">
        <div><span class="reading-label">{stage.label}</span><h3>{stage.title}</h3></div>
        <p>{stage.body}</p>
      </div>
      <details class="stage-guide" open>
        <summary>All stage explanations <span>{stages.length} stages</span></summary>
        <ol>
          {#each stages as item (item.id)}
            <li>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          {/each}
        </ol>
      </details>
    </section>

    <section class="architecture" aria-labelledby="architecture-title">
      <div>
        <h2 id="architecture-title">A shared clock.<br />Clear responsibilities.</h2>
        <p>The audio clock anchors transport time. One animation loop publishes the snapshot that audio, video seeks, shader controls, and the program cut all use.</p>
      </div>
      <details open>
        <summary>Who owns what <span>7 parts</span></summary>
        <div class="table-scroll">
          <table><caption class="sr-only">Responsibilities in the Beatsmaxxer architecture</caption>
            <thead><tr><th scope="col">Concern</th><th scope="col">Owner</th><th scope="col">Responsibility</th></tr></thead>
            <tbody>{#each owners as [concern, owner, detail] (concern)}<tr><th scope="row">{concern}</th><td>{owner}</td><td>{detail}</td></tr>{/each}</tbody>
          </table>
        </div>
      </details>
    </section>
    <footer>
      <p>Built with Svelte, Web Audio, and WebGPU.</p>
      <a href="https://github.com/gordo-v1su4/beatsmaxxer-pro/blob/main/svelte/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">Read the architecture</a>
    </footer>
  </div>
</main>

<style>
  .case-study { --paper: #edf0f3; --muted: #adb4bc; --line: #343a40; --signal: #7fe3d4; height: 100dvh; overflow: auto; background: #111416; color: var(--paper); font-family: 'Avenir Next', 'Segoe UI', sans-serif; }
  .page { max-width: 1280px; margin: 0 auto; padding: 0 48px; }
  nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 88px; border-bottom: 1px solid var(--line); }
  a { color: inherit; text-underline-offset: 5px; }
  .wordmark { font-weight: 750; font-size: 18px; text-decoration: none; letter-spacing: -.5px; }
  .open-app { font-size: 13px; text-decoration: none; }
  .open-app span { margin-left: 10px; color: var(--signal); }
  header { display: grid; grid-template-columns: 1.5fr 1fr; align-items: end; gap: 80px; padding: 66px 0 56px; }
  .kicker { font-size: 14px; color: var(--signal); margin: 0 0 20px; }
  h1 { font-family: 'Archivo Black', 'Arial Black', sans-serif; font-size: clamp(34px, 4.8vw, 62px); font-weight: 400; letter-spacing: -2.5px; line-height: 1.08; margin: 0 0 24px; }
  .lede, .clock-note p, .architecture p { color: var(--muted); font-size: 15px; line-height: 1.75; max-width: 58ch; margin: 0; }
  .clock-note { max-width: 330px; padding-bottom: 4px; }
  .clock-note strong { font-size: 17px; display: block; margin-bottom: 10px; }
  .beat-track { display: flex; align-items: end; gap: 7px; height: 42px; margin-bottom: 20px; }
  .beat-track i { display: block; height: 14px; width: 12px; background: #576761; }
  .beat-track i:nth-child(4n + 1) { height: 38px; background: var(--signal); }
  .beat-track i:nth-child(even) { height: 23px; }
  .explorer { background: #1b2023; border: 1px solid var(--line); border-radius: 12px; padding: 28px 30px 0; }
  .explorer-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; }
  h2 { font-size: 23px; font-weight: 600; letter-spacing: -.6px; line-height: 1.3; margin: 0; }
  .view-switch { display: flex; gap: 4px; padding: 4px; border-radius: 8px; background: #101416; }
  .view-switch button { font-size: 13px; padding: 11px 16px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); }
  .view-switch button[aria-pressed='true'] { background: #35463f; color: #d2f6e9; }
  .hint { margin: 14px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .pipeline { height: 300px; position: relative; margin-top: 12px; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  path { fill: none; stroke: #586168; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  path.active { stroke: var(--signal); stroke-width: 2; }
  .stage { position: absolute; width: 16%; height: 24%; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 10px 12px; border: 1px solid #566069; border-radius: 6px; color: var(--paper); text-align: left; background: #21292e; }
  .stage.selected { border-color: var(--signal); background: #2b3d37; }
  .stage:hover { border-color: var(--paper); }
  .stage-label { font-size: 10px; color: #bdc6cd; }
  .stage strong { font-size: 12px; font-weight: 600; line-height: 1.35; }
  .stage-dot { position: absolute; right: 8px; top: 8px; width: 4px; height: 4px; border-radius: 50%; background: #586168; }
  .selected .stage-dot { background: var(--signal); }
  .mobile-connections { display: none; }
  .reading { display: grid; grid-template-columns: 1fr 2fr; gap: 40px; border-top: 1px solid var(--line); padding: 26px 0 30px; min-height: 150px; }
  .reading-label { color: var(--signal); font-size: 12px; }
  h3 { font-size: 23px; font-weight: 600; margin: 8px 0 0; letter-spacing: -.6px; }
  .reading p { font-size: 15px; line-height: 1.75; margin: 0; max-width: 65ch; color: #d3d9dc; }
  .architecture { display: grid; grid-template-columns: 1fr 1.5fr; gap: 64px; padding: 54px 0; }
  .architecture p { margin-top: 16px; font-size: 14px; }
  details { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); align-self: start; }
  summary { cursor: pointer; padding: 20px 0; font-size: 16px; }
  summary span { float: right; font-size: 12px; color: var(--muted); }
  .stage-guide { border-bottom: 0; }
  .stage-guide ol { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 40px; margin: 0; padding: 0 0 30px 22px; }
  .stage-guide li { padding-left: 4px; color: var(--signal); }
  .stage-guide h3 { color: var(--paper); font-size: 16px; margin: 0 0 8px; letter-spacing: 0; }
  .stage-guide p { color: var(--muted); font-size: 14px; line-height: 1.75; margin: 0; }
  .table-scroll { overflow-x: auto; padding-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.6; text-align: left; }
  th, td { padding: 12px 10px 12px 0; border-top: 1px solid var(--line); vertical-align: top; }
  thead th { color: var(--muted); font-weight: 400; }
  tbody th { min-width: 88px; font-weight: 500; }
  td { color: var(--muted); }
  footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid var(--line); padding: 24px 0 32px; color: var(--muted); font-size: 12px; }
  footer p { margin: 0; }
  button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--signal); outline-offset: 5px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (max-width: 1000px) {
    .page { padding: 0 28px; }
    header { gap: 36px; }
    .stage { padding: 8px; }
    .stage-label { font-size: 9px; }
    .stage strong { font-size: 11px; }
    .architecture { gap: 32px; }
  }
  @media (max-width: 700px) {
    .page { padding: 0 20px; }
    nav { min-height: 72px; }
    .wordmark { font-size: 15px; }
    .open-app { font-size: 11px; }
    .open-app span { margin-left: 3px; }
    header { grid-template-columns: 1fr; padding: 38px 0; gap: 28px; }
    h1 { letter-spacing: -1.5px; }
    .clock-note { max-width: none; border-left: 2px solid var(--signal); padding-left: 18px; }
    .beat-track { display: none; }
    .clock-note p { font-size: 13px; }
    .explorer { padding: 20px 18px 0; }
    .explorer-heading { align-items: start; flex-direction: column; gap: 16px; }
    .view-switch { width: 100%; }
    .view-switch button { flex: 1; padding: 12px 8px; }
    .pipeline { height: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 22px 0; }
    svg { display: none; }
    .stage { position: relative; left: auto !important; top: auto !important; width: 100%; height: auto; min-height: 78px; padding: 12px; }
    .stage-label { font-size: 10px; }
    .stage strong { font-size: 12px; }
    .mobile-connections { display: block; margin: 0 0 24px; font-size: 12px; line-height: 1.75; color: var(--muted); }
    .mobile-connections p { color: var(--paper); margin: 0 0 8px; }
    .mobile-connections ul { list-style: none; padding: 0; margin: 0; }
    .mobile-connections li + li { margin-top: 4px; }
    .mobile-connections span[aria-hidden] { color: var(--signal); margin: 0 4px; }
    .reading { grid-template-columns: 1fr; gap: 16px; }
    .reading p { font-size: 14px; }
    .stage-guide ol { grid-template-columns: 1fr; gap: 20px; }
    .architecture { grid-template-columns: 1fr; gap: 28px; padding: 36px 0; }
    footer { flex-direction: column; gap: 12px; }
  }
</style>
