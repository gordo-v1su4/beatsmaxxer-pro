/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_ESSENTIA_ANALYSIS_ENGINE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const __APP_ESSENTIA_ANALYSIS_ENABLED__: boolean;
declare const __APP_ESSENTIA_ANALYSIS_ENGINE__: string;

/** Bun executes repository QA scripts; keep their runtime global visible to svelte-check. */
declare const Bun: {
	sleep(milliseconds: number): Promise<void>;
	write(path: string, data: Uint8Array): Promise<number>;
	spawn(args: string[], options?: Record<string, unknown>): any;
};
