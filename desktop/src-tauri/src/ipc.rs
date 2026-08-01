use crate::{decode_runtime, DecodeRuntime};
use bsp_decode::{backend_name, probe_mp4};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn decode_backend_name() -> String {
    backend_name().to_string()
}

#[tauri::command]
pub fn probe_clip(path: String) -> Result<bsp_decode::Mp4Probe, String> {
    probe_mp4(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_clip_path(
    app: AppHandle,
    module_id: String,
    path: String,
    runtime: State<'_, DecodeRuntime>,
) -> Result<(), String> {
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .open_clip(module_id, path)
        .map_err(|error| error.to_string())?;
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .start();
    runtime.ensure_worker(app.clone());
    Ok(())
}

#[tauri::command]
pub fn start_decode(app: AppHandle, runtime: State<'_, DecodeRuntime>) -> Result<(), String> {
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .start();
    runtime.ensure_worker(app);
    Ok(())
}

#[tauri::command]
pub fn release_clip(module_id: String, runtime: State<'_, DecodeRuntime>) -> Result<(), String> {
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .release_clip(&module_id);
    Ok(())
}

#[tauri::command]
pub fn stop_decode(runtime: State<'_, DecodeRuntime>) -> Result<(), String> {
    runtime.stop_worker();
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .stop();
    Ok(())
}
