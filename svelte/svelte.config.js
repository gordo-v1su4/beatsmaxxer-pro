import adapter from '@sveltejs/adapter-static';

/**
 * The single source of truth for Svelte/SvelteKit options.
 *
 * `vite.config.ts` calls `sveltekit()` with no arguments on purpose: passing
 * options inline makes SvelteKit ignore this file for the build, while
 * `svelte-kit sync`, `svelte-check` and the editor extension keep reading it —
 * two configs that silently drift apart.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		})
	}
};

export default config;
