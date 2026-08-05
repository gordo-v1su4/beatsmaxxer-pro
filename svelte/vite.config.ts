import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisProxyConfigFromEnv, essentiaDevProxyPlugin } from './vite/essentiaDevProxy';
import { isAnalysisUploadPathEnabled } from '../api/analyze/policy';

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
	// Key-free on purpose — see isAnalysisUploadPathEnabled. The credential is a
	// runtime server secret and must never gate what the browser bundle can offer.
	const essentiaEnabled = isAnalysisUploadPathEnabled(essentiaProxyConfig);
	// Native decode/composition is the desktop contract. The legacy CPU-frame
	// bridge has its own explicit diagnostic switch; stale DESKTOP_NATIVE_DECODE
	// values from the older experimental phase must not silently disable the
	// compositor UI/layout bridge. The native compositor only exists on macOS;
	// other hosts must fall back to htmlVideoSource inside the Tauri webview.
	const desktopNativeDecode =
		isTauriBuild &&
		process.platform === 'darwin' &&
		process.env.BSP_DESKTOP_CPU_FRAME_BRIDGE !== '1';

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
			__APP_ESSENTIA_ANALYSIS_ENGINE__: JSON.stringify(essentiaAnalysisEngine),
			__APP_DESKTOP_NATIVE_DECODE__: JSON.stringify(desktopNativeDecode)
		},
		server: {
			port: 5174,
			strictPort: true,
			// Tailscale cloud: DEV_HOST=0.0.0.0. Local/Tauri: bind IPv4 explicitly
			// (default Vite can listen on ::1 only → ERR_CONNECTION_REFUSED on 127.0.0.1).
			host: env.DEV_HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
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
