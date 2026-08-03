/** Native AVFoundation/VideoToolbox decode is the default inside Tauri. */
export function isDesktopNativeDecodeEnabled() {
	return typeof __APP_DESKTOP_NATIVE_DECODE__ === 'boolean' && __APP_DESKTOP_NATIVE_DECODE__;
}
