use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use bsp_decode::DecodeScheduler;
use tauri::{AppHandle, Manager, State, WindowEvent};

#[derive(Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeSourceStats {
    pub open_count: u64,
    pub produced_frames: u64,
    pub mailbox_overwrites: u64,
    pub pulled_frames: u64,
    pub decoded_cpu_bytes: u64,
    pub frame_ipc_bytes: u64,
    pub last_width: u32,
    pub last_height: u32,
    pub last_timestamp_us: i64,
    pub last_sequence: u64,
}

pub struct DecodeStatsState {
    reset_at: Instant,
    sources: HashMap<String, DecodeSourceStats>,
    pull_batches: u64,
    decoded_cpu_bytes: u64,
    frame_ipc_bytes: u64,
    frame_ipc_batches: u64,
    cpu_fallback_frames: u64,
}

impl Default for DecodeStatsState {
    fn default() -> Self {
        Self {
            reset_at: Instant::now(),
            sources: HashMap::new(),
            pull_batches: 0,
            decoded_cpu_bytes: 0,
            frame_ipc_bytes: 0,
            frame_ipc_batches: 0,
            cpu_fallback_frames: 0,
        }
    }
}

impl DecodeStatsState {
    pub(crate) fn reset(&mut self) {
        *self = Self::default();
    }

    pub(crate) fn record_open(&mut self, source_id: &str) {
        self.sources
            .entry(source_id.to_string())
            .or_default()
            .open_count += 1;
    }

    pub(crate) fn record_produced(
        &mut self,
        source_id: String,
        width: u32,
        height: u32,
        timestamp_us: i64,
        sequence: u64,
        decoded_cpu_bytes: u64,
        overwritten: bool,
    ) {
        let source = self.sources.entry(source_id).or_default();
        source.produced_frames += 1;
        source.decoded_cpu_bytes += decoded_cpu_bytes;
        self.decoded_cpu_bytes += decoded_cpu_bytes;
        self.cpu_fallback_frames += u64::from(decoded_cpu_bytes > 0);
        source.mailbox_overwrites += u64::from(overwritten);
        source.last_width = width;
        source.last_height = height;
        source.last_timestamp_us = timestamp_us;
        source.last_sequence = sequence;
    }

    pub(crate) fn record_pull(&mut self, frames: &[bsp_decode::DecodeFrame], packet_bytes: u64) {
        self.pull_batches += 1;
        self.frame_ipc_batches += u64::from(!frames.is_empty());
        self.frame_ipc_bytes += packet_bytes;
        for frame in frames {
            let source = self.sources.entry(frame.module_id.clone()).or_default();
            source.pulled_frames += 1;
            source.frame_ipc_bytes += frame.bgra.len() as u64;
        }
    }
}

fn process_memory_high_water_bytes() -> u64 {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::zeroed();
    let result = unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) };
    if result != 0 {
        return 0;
    }
    let max_rss = unsafe { usage.assume_init().ru_maxrss.max(0) as u64 };
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        max_rss.saturating_mul(1024)
    }
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    {
        max_rss
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodeStatsSnapshot {
    backend: String,
    elapsed_ms: u128,
    preview_decoder_count: usize,
    program_decoder_active: bool,
    pull_batches: u64,
    produced_frames: u64,
    mailbox_overwrites: u64,
    pulled_frames: u64,
    drop_rate: f64,
    decoded_cpu_bytes: u64,
    frame_ipc_bytes: u64,
    frame_ipc_batches: u64,
    zero_copy_frames: u64,
    cpu_fallback_frames: u64,
    iosurface_imports: u64,
    iosurface_import_failures: u64,
    gpu_submissions: u64,
    native_compositor: renderer::NativeCompositorSnapshot,
    memory_high_water_bytes: u64,
    sources: HashMap<String, DecodeSourceStats>,
    last_error: Option<String>,
}

pub struct DecodeRuntime {
    pub(crate) scheduler: Mutex<DecodeScheduler>,
    pub(crate) latest_frames: Mutex<HashMap<String, bsp_decode::DecodeFrame>>,
    pub(crate) last_error: Mutex<Option<String>>,
    pub(crate) stats: Mutex<DecodeStatsState>,
    stop_flag: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}

impl Default for DecodeRuntime {
    fn default() -> Self {
        Self {
            scheduler: Mutex::new(DecodeScheduler::default()),
            latest_frames: Mutex::new(HashMap::new()),
            last_error: Mutex::new(None),
            stats: Mutex::new(DecodeStatsState::default()),
            stop_flag: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }
}

impl DecodeRuntime {
    pub(crate) fn reset_stats(&self) -> Result<(), String> {
        self.stats
            .lock()
            .map_err(|_| "decode stats poisoned".to_string())?
            .reset();
        *self
            .last_error
            .lock()
            .map_err(|_| "decode error state poisoned".to_string())? = None;
        self.latest_frames
            .lock()
            .map_err(|_| "native frame mailbox poisoned".to_string())?
            .clear();
        Ok(())
    }

    pub(crate) fn stats_snapshot(
        &self,
        compositor: &renderer::NativeCompositorState,
    ) -> Result<DecodeStatsSnapshot, String> {
        let (preview_decoder_count, program_decoder_active) = {
            let scheduler = self
                .scheduler
                .lock()
                .map_err(|_| "decode scheduler poisoned".to_string())?;
            (scheduler.clip_count(), scheduler.program_decoder_active())
        };
        let stats = self
            .stats
            .lock()
            .map_err(|_| "decode stats poisoned".to_string())?;
        let produced_frames = stats
            .sources
            .values()
            .map(|source| source.produced_frames)
            .sum();
        let mailbox_overwrites = stats
            .sources
            .values()
            .map(|source| source.mailbox_overwrites)
            .sum();
        let pulled_frames = stats
            .sources
            .values()
            .map(|source| source.pulled_frames)
            .sum();
        let last_error = self
            .last_error
            .lock()
            .map_err(|_| "decode error state poisoned".to_string())?
            .clone();
        Ok(DecodeStatsSnapshot {
            backend: if compositor.metrics.active.load(Ordering::Acquire) {
                "videotoolbox-iosurface-wgpu-metal".to_string()
            } else {
                bsp_decode::backend_name().to_string()
            },
            elapsed_ms: stats.reset_at.elapsed().as_millis(),
            preview_decoder_count,
            program_decoder_active,
            pull_batches: stats.pull_batches,
            produced_frames,
            mailbox_overwrites,
            pulled_frames,
            drop_rate: if produced_frames == 0 {
                0.0
            } else {
                mailbox_overwrites as f64 / produced_frames as f64
            },
            decoded_cpu_bytes: stats.decoded_cpu_bytes,
            frame_ipc_bytes: stats.frame_ipc_bytes,
            frame_ipc_batches: stats.frame_ipc_batches,
            zero_copy_frames: compositor.metrics.zero_copy_frames.load(Ordering::Relaxed),
            cpu_fallback_frames: stats.cpu_fallback_frames,
            iosurface_imports: compositor.metrics.iosurface_imports.load(Ordering::Relaxed),
            iosurface_import_failures: compositor
                .metrics
                .iosurface_import_failures
                .load(Ordering::Relaxed),
            gpu_submissions: compositor.metrics.gpu_submissions.load(Ordering::Relaxed),
            native_compositor: compositor.metrics_snapshot(),
            memory_high_water_bytes: process_memory_high_water_bytes(),
            sources: stats.sources.clone(),
            last_error,
        })
    }

    pub(crate) fn stop_worker(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(handle) = self.worker.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = handle.join();
        }
        self.stop_flag.store(false, Ordering::SeqCst);
    }

    pub(crate) fn ensure_worker(&self, app: AppHandle) {
        let mut worker = self.worker.lock().expect("decode worker lock");
        if worker.is_some() {
            return;
        }
        let stop_flag = Arc::clone(&self.stop_flag);
        let handle =
            thread::spawn(move || {
                let compatibility_bridge =
                    std::env::var("BSP_DESKTOP_CPU_FRAME_BRIDGE").is_ok_and(|value| value == "1");
                while !stop_flag.load(Ordering::SeqCst) {
                    if compatibility_bridge {
                        let result = app.state::<DecodeRuntime>().scheduler.lock().ok().map(
                            |mut scheduler| {
                                let frames = scheduler.tick_frames();
                                let worker_error = scheduler.take_last_worker_error();
                                (frames, worker_error)
                            },
                        );
                        match result {
                            Some((Ok(frames), worker_error)) => {
                                let mut produced = Vec::with_capacity(frames.len());
                                if let Ok(mut latest) =
                                    app.state::<DecodeRuntime>().latest_frames.lock()
                                {
                                    for frame in frames {
                                        let source_id = frame.module_id.clone();
                                        let sample = (
                                            source_id.clone(),
                                            frame.width,
                                            frame.height,
                                            frame.timestamp_us,
                                            frame.sequence,
                                            frame.bgra.len() as u64,
                                        );
                                        let overwritten = latest.insert(source_id, frame).is_some();
                                        produced.push((sample, overwritten));
                                    }
                                }
                                if let Ok(mut stats) = app.state::<DecodeRuntime>().stats.lock() {
                                    for (
                                        (
                                            source_id,
                                            width,
                                            height,
                                            timestamp_us,
                                            sequence,
                                            decoded_cpu_bytes,
                                        ),
                                        overwritten,
                                    ) in produced
                                    {
                                        stats.record_produced(
                                            source_id,
                                            width,
                                            height,
                                            timestamp_us,
                                            sequence,
                                            decoded_cpu_bytes,
                                            overwritten,
                                        );
                                    }
                                }
                                if let Some(error) = worker_error {
                                    if let Ok(mut last_error) =
                                        app.state::<DecodeRuntime>().last_error.lock()
                                    {
                                        *last_error = Some(error);
                                    }
                                }
                            }
                            Some((Err(error), _)) => {
                                if let Ok(mut last_error) =
                                    app.state::<DecodeRuntime>().last_error.lock()
                                {
                                    *last_error = Some(error.to_string());
                                }
                            }
                            None => {}
                        }
                    } else {
                        let result = app.state::<DecodeRuntime>().scheduler.lock().ok().map(
                            |mut scheduler| {
                                let frames = scheduler.tick_native_frames();
                                let worker_error = scheduler.take_last_worker_error();
                                (frames, worker_error)
                            },
                        );
                        match result {
                            Some((Ok(frames), worker_error)) => {
                                let produced = frames
                                    .iter()
                                    .map(|frame| {
                                        (
                                            frame.module_id.clone(),
                                            frame.width,
                                            frame.height,
                                            frame.timestamp_us,
                                            frame.sequence,
                                        )
                                    })
                                    .collect::<Vec<_>>();
                                if let Err(error) = app
                                    .state::<renderer::NativeCompositorState>()
                                    .submit_frames(frames)
                                {
                                    if let Ok(mut last_error) =
                                        app.state::<DecodeRuntime>().last_error.lock()
                                    {
                                        *last_error = Some(error);
                                    }
                                }
                                if let Ok(mut stats) = app.state::<DecodeRuntime>().stats.lock() {
                                    for (source_id, width, height, timestamp_us, sequence) in
                                        produced
                                    {
                                        stats.record_produced(
                                            source_id,
                                            width,
                                            height,
                                            timestamp_us,
                                            sequence,
                                            0,
                                            false,
                                        );
                                    }
                                }
                                if let Some(error) = worker_error {
                                    if let Ok(mut last_error) =
                                        app.state::<DecodeRuntime>().last_error.lock()
                                    {
                                        *last_error = Some(error);
                                    }
                                }
                            }
                            Some((Err(error), _)) => {
                                if let Ok(mut last_error) =
                                    app.state::<DecodeRuntime>().last_error.lock()
                                {
                                    *last_error = Some(error.to_string());
                                }
                            }
                            None => {}
                        }
                    }
                    thread::sleep(Duration::from_millis(16));
                }
            });
        *worker = Some(handle);
    }
}

pub struct ClipRegistry;

mod decode;
mod env;
mod essentia;
mod ipc;
pub mod renderer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env::load_repo_dotenv();
    env::log_essentia_startup();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(DecodeRuntime::default())
        .manage(renderer::NativeCompositorState::default())
        .manage(ClipRegistry)
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(marker) = objc2::MainThreadMarker::new() {
                objc2_app_kit::NSApplication::sharedApplication(marker).activate();
            }
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main Tauri window is missing".to_string())?;
            // A launched desktop editor must become a real, visible macOS
            // window immediately. In dev/proof launches an unfocused WKWebView
            // can be background-throttled before media surfaces register.
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            app.state::<renderer::NativeCompositorState>()
                .attach(&window)?;
            if std::env::var("BSP_NATIVE_COMPOSITOR_PROOF").is_ok_and(|value| value == "1") {
                app.state::<renderer::NativeCompositorState>()
                    .set_test_pattern(true)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(size) => {
                window
                    .state::<renderer::NativeCompositorState>()
                    .resize(size.width, size.height);
            }
            WindowEvent::Destroyed => {
                window.state::<renderer::NativeCompositorState>().shutdown();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            ipc::decode_backend_name,
            ipc::open_clip_path,
            ipc::release_clip,
            ipc::pull_decode_frames,
            ipc::decode_stats,
            ipc::reset_decode_stats,
            ipc::write_desktop_proof_report,
            ipc::wait_desktop_proof,
            ipc::prepare_decode_program_source,
            ipc::set_decode_program_source,
            ipc::stop_decode,
            ipc::probe_clip,
            ipc::start_decode,
            ipc::stage_clip_file,
            ipc::update_decode_transport,
            ipc::update_native_compositor_layout,
            ipc::set_native_compositor_test_pattern,
            essentia::essentia_configured,
            essentia::analyze_rhythm
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beat Surfer Pro desktop");
}

pub fn decode_runtime(app: &AppHandle) -> State<'_, DecodeRuntime> {
    app.state::<DecodeRuntime>()
}
