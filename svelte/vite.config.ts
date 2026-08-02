import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisProxyConfigFromEnv, essentiaDevProxyPlugin } from './vite/essentiaDevProxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode, command }) => {
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
			__APP_ESSENTIA_ANALYSIS_ENABLED__: JSON.stringify(
				essentiaProxyConfig.enabled && essentiaProxyConfig.deploymentMode === 'development'
			),
			__APP_ESSENTIA_ANALYSIS_ENGINE__: JSON.stringify(essentiaAnalysisEngine)
		},
		server: {
			port: 5174,
			strictPort: true,
			host: env.DEV_HOST === '0.0.0.0' ? '0.0.0.0' : undefined,
			fs: {
				allow: ['..']
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
	};
});
