import { isTauriRuntime } from '$lib/platform/runtime';

/** Invoke a Tauri command — only available inside the desktop shell. */
export async function tauriInvoke<T>(
	cmd: string,
	args?: Record<string, unknown>
): Promise<T> {
	if (!isTauriRuntime()) {
		throw new Error('Tauri invoke is unavailable outside the desktop runtime');
	}
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<T>(cmd, args);
}

export async function isDesktopEssentiaConfigured(): Promise<boolean> {
	if (!isTauriRuntime()) return false;
	try {
		return await tauriInvoke<boolean>('essentia_configured');
	} catch {
		return false;
	}
}
