import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
	base: './',
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' })
		}),
		viteSingleFile({ useRecommendedBuildConfig: false })
	],
	server: {
		port: 5174,
		strictPort: true,
		fs: {
			allow: ['..']
		},
		proxy: {
			'/__qa': {
				target: 'http://localhost:5174',
				rewrite: () => '/qa-proxy'
			}
		}
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	},
	ssr: {
		noExternal: ['@lucide/svelte']
	},
		build: {
		assetsInlineLimit: () => true,
		chunkSizeWarningLimit: 100_000_000,
		cssCodeSplit: false,
		assetsDir: ''
	}
});
