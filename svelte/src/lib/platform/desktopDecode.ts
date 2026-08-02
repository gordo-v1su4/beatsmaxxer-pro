/** Opt-in Rust IPC decode path. Off by default until VideoToolbox outputs real frames. */
export function isDesktopNativeDecodeEnabled() {
	return typeof __APP_DESKTOP_NATIVE_DECODE__ === 'boolean' && __APP_DESKTOP_NATIVE_DECODE__;
}
