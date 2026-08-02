use std::fs;
use std::path::PathBuf;

use bsp_decode::{backend_name, probe_mp4};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, State,
};

use crate::renderer::{NativeCompositorState, NativeSurfaceRect};
use crate::{DecodeRuntime, DecodeStatsSnapshot};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTimeline {
    source_id: String,
    position_us: i64,
    playback_rate: f64,
}

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
pub fn stage_clip_file(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let module_id = request
        .headers()
        .get("x-bsp-module-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "missing x-bsp-module-id header".to_string())?;
    let file_name = request
        .headers()
        .get("x-bsp-file-name")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("clip.mp4");
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("stage_clip_file requires a raw binary body".into()),
    };
    let safe_name = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
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
) -> Result<bsp_decode::Mp4Probe, String> {
    let probe = probe_mp4(&path).map_err(|error| error.to_string())?;
    let stats_source_id = module_id.clone();
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
    runtime
        .stats
        .lock()
        .map_err(|_| "decode stats poisoned".to_string())?
        .record_open(&stats_source_id);
    runtime.ensure_worker(app.clone());
    Ok(probe)
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
pub fn update_decode_transport(
    position_us: i64,
    playing: bool,
    playback_rate: f64,
    generation: u64,
    source_timelines: Vec<SourceTimeline>,
    runtime: State<'_, DecodeRuntime>,
) -> Result<(), String> {
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .update_transport(
            position_us,
            playing,
            playback_rate,
            generation,
            source_timelines
                .into_iter()
                .map(|source| {
                    (
                        source.source_id,
                        (
                            source.position_us.max(0),
                            source.playback_rate.clamp(0.01, 4.0),
                        ),
                    )
                })
                .collect(),
        );
    Ok(())
}

#[tauri::command]
pub async fn set_decode_program_source(
    source_id: Option<String>,
    runtime: State<'_, DecodeRuntime>,
    compositor: State<'_, NativeCompositorState>,
) -> Result<(), String> {
    compositor.request_program_source(source_id.clone());
    let (request, ready_frame) = {
        let mut scheduler = runtime
            .scheduler
            .lock()
            .map_err(|_| "decode scheduler poisoned".to_string())?;
        let request = scheduler
            .begin_program_source(source_id)
            .map_err(|error| error.to_string())?;
        (request, scheduler.take_program_ready_frame())
    };
    if let Some(frame) = ready_frame {
        compositor.submit_frames(vec![frame])?;
    }
    let Some(request) = request else {
        return Ok(());
    };
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        bsp_decode::DecodeScheduler::open_program_lane(request)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .commit_program_lane(prepared);
    Ok(())
}

#[tauri::command]
pub async fn prepare_decode_program_source(
    source_id: Option<String>,
    runtime: State<'_, DecodeRuntime>,
) -> Result<(), String> {
    let request = runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .begin_prepare_program_source(source_id)
        .map_err(|error| error.to_string())?;
    let Some(request) = request else {
        return Ok(());
    };
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        bsp_decode::DecodeScheduler::open_program_lane(request)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .commit_prepared_program_lane(prepared);
    Ok(())
}

#[tauri::command]
pub fn pull_decode_frames(runtime: State<'_, DecodeRuntime>) -> Result<Response, String> {
    let frames: Vec<bsp_decode::DecodeFrame> = {
        let mut latest = runtime
            .latest_frames
            .lock()
            .map_err(|_| "native frame mailbox poisoned".to_string())?;
        latest.drain().map(|(_, frame)| frame).collect()
    };
    let packet = crate::decode::encode_frame_batch(&frames);
    runtime
        .stats
        .lock()
        .map_err(|_| "decode stats poisoned".to_string())?
        .record_pull(&frames, packet.len() as u64);
    Ok(Response::new(packet))
}

#[tauri::command]
pub fn reset_decode_stats(
    runtime: State<'_, DecodeRuntime>,
    compositor: State<'_, NativeCompositorState>,
) -> Result<(), String> {
    runtime.reset_stats()?;
    compositor.reset_metrics();
    Ok(())
}

#[tauri::command]
pub fn decode_stats(
    runtime: State<'_, DecodeRuntime>,
    compositor: State<'_, NativeCompositorState>,
) -> Result<DecodeStatsSnapshot, String> {
    runtime.stats_snapshot(&compositor)
}

#[tauri::command]
pub fn update_native_compositor_layout(
    viewport_width: u32,
    viewport_height: u32,
    rects: Vec<NativeSurfaceRect>,
    compositor: State<'_, NativeCompositorState>,
) -> Result<(), String> {
    compositor.resize(viewport_width, viewport_height);
    compositor.update_layout(rects)
}

#[tauri::command]
pub fn set_native_compositor_test_pattern(
    enabled: bool,
    compositor: State<'_, NativeCompositorState>,
) -> Result<(), String> {
    compositor.set_test_pattern(enabled)
}

#[tauri::command]
pub fn write_desktop_proof_report(report: String) -> Result<String, String> {
    if !cfg!(debug_assertions) {
        return Err("desktop proof reporting is available only in debug builds".to_string());
    }
    let path = std::env::var("BSP_DESKTOP_PROOF_PATH")
        .map(PathBuf::from)
        .map_err(|_| "BSP_DESKTOP_PROOF_PATH is not set".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "desktop proof path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, report).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "desktop proof path is not valid UTF-8".to_string())
}

#[tauri::command]
pub async fn wait_desktop_proof(duration_ms: u64) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("desktop proof waits are available only in debug builds".to_string());
    }
    let duration_ms = duration_ms.min(120_000);
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(duration_ms));
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stop_decode(runtime: State<'_, DecodeRuntime>) -> Result<(), String> {
    runtime.stop_worker();
    runtime
        .scheduler
        .lock()
        .map_err(|_| "decode scheduler poisoned".to_string())?
        .stop();
    runtime
        .latest_frames
        .lock()
        .map_err(|_| "native frame mailbox poisoned".to_string())?
        .clear();
    Ok(())
}
