import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisProxyConfigFromEnv, essentiaDevProxyPlugin } from './vite/essentiaDevProxy';
import { isAnalysisProxyConfigured } from '../api/analyze/policy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode, command }) => {
	const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM);
	const env = loadEnv(mode, repoRoot, '');
	const essentiaProxyConfig = analysisProxyConfigFromEnv(
		env,
		command === 'serve' ? 'development' : 'production'
	);
	const essentiaAnalysisEngine = (
		env.ESSENTIA_ANALYSIS_ENGINE ||
		env.VITE_ESSENTIA_ANALYSIS_ENGINE ||
		''
	).trim();
	const essentiaEnabled =
		isAnalysisProxyConfigured(essentiaProxyConfig) &&
		(command === 'serve' || isTauriBuild);

	return {
		base: './',
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }: { filename: string }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({ fallback: 'index.html' })
			}),
			viteSingleFile({ useRecommendedBuildConfig: false }),
			essentiaDevProxyPlugin(essentiaProxyConfig)
		],
		define: {
			__APP_ESSENTIA_ANALYSIS_ENABLED__: JSON.stringify(essentiaEnabled),
			__APP_ESSENTIA_ANALYSIS_ENGINE__: JSON.stringify(essentiaAnalysisEngine)
		},
		server: {
			port: 5174,
			strictPort: true,
			// Bind IPv4 explicitly — default Vite can listen on ::1 only, which breaks
			// http://localhost:5174 and Tauri devUrl (127.0.0.1) with ERR_CONNECTION_REFUSED.
			host: '127.0.0.1',
			fs: {
				allow: ['..']
			}
		},
		resolve: {
			alias: {
				$lib: path.resolve('./src/lib'),
				...(isTauriBuild
					? {}
					: {
							'@tauri-apps/api/core': path.resolve('./src/lib/platform/tauri-stubs/core.ts'),
							'@tauri-apps/api/event': path.resolve('./src/lib/platform/tauri-stubs/event.ts')
						})
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
	};
});
