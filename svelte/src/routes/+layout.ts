/**
 * No server render.
 *
 * Nothing on this page has server-rendered value — the entire app is a WebGPU
 * device, an AudioContext and a rAF loop, all of which start in `onMount`. The
 * prerendered markup was therefore a rack no one ever saw.
 *
 * It stopped being merely useless once the phone shell landed. Which shell
 * mounts has to be known before the first render: `attachCanvas` awaits device
 * init, so a rack that mounts for one frame and unmounts registers its ten
 * canvas bindings *after* the matching `detachCanvas` has already run, leaving
 * ten ghost canvases rendering for the life of the session. Deciding on the
 * client, before any markup exists, is the only ordering that cannot race.
 *
 * `adapter-static` already emits `fallback: 'index.html'`, so the deploy shape
 * does not change — the shell is served for every route exactly as before.
 */
export const ssr = false;
