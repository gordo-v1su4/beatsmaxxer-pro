use std::fs;
use std::path::PathBuf;

use bsp_decode::{backend_name, probe_mp4};
use tauri::{AppHandle, Manager, State};

use crate::DecodeRuntime;

fn clip_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("clips");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn decode_backend_name() -> String {
    backend_name().to_string()
}

#[tauri::command]
pub fn probe_clip(path: String) -> Result<bsp_decode::Mp4Probe, String> {
    probe_mp4(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stage_clip_file(
    app: AppHandle,
    module_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_name = file_name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') { ch } else { '_' })
        .collect::<String>();
    let path = clip_cache_dir(&app)?.join(format!("{module_id}-{safe_name}"));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "clip path is not valid UTF-8".to_string())
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
