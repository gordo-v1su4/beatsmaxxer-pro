import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
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

	return {
		// No `base` here either: SvelteKit derives it from kit.paths and overrides
		// ours. Relative asset paths (what Tauri needs) come from kit.paths.relative,
		// which is on by default.
		plugins: [
			tailwindcss(),
			// Options live in svelte.config.js — passing any here makes SvelteKit
			// ignore that file, which svelte-kit sync and svelte-check still read.
			sveltekit(),
			essentiaDevProxyPlugin(essentiaProxyConfig)
		],
		define: {
			__APP_ESSENTIA_ANALYSIS_ENABLED__: JSON.stringify(essentiaEnabled),
			__APP_ESSENTIA_ANALYSIS_ENGINE__: JSON.stringify(essentiaAnalysisEngine)
		},
		server: {
			port: 5174,
			strictPort: true,
			// Tailscale cloud: DEV_HOST=0.0.0.0. Local/Tauri: bind IPv4 explicitly
			// (default Vite can listen on ::1 only → ERR_CONNECTION_REFUSED on 127.0.0.1).
			host: env.DEV_HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
			/*
			 * Let a Tailscale hostname reach the dev server.
			 *
			 * This is how the phone gets at a local build. WebGPU requires a secure
			 * context, so hitting the machine's Tailscale IP over plain http gives
			 * a phone `navigator.gpu === undefined` and the no-GPU panel rather
			 * than the app — the address has to be https. `tailscale serve` issues
			 * a real certificate for the machine's `*.ts.net` name and proxies to
			 * localhost, which satisfies that.
			 *
			 * Vite rejects requests whose Host header it does not recognise, so
			 * without this the `.ts.net` request is answered with "Blocked request"
			 * and never reaches the app. Dev only — `vite build` never reads it —
			 * and scoped to the one suffix rather than opening the server to any
			 * host.
			 */
			allowedHosts: ['.ts.net'],
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
			// No cssCodeSplit here: SvelteKit derives it from kit.output.bundleStrategy
			// and overrides whatever we set. Tauri loads svelte/build as a directory,
			// so a single inlined file was never a requirement.
			assetsDir: ''
		}
	};
});
