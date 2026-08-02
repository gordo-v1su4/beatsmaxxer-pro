use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use bsp_decode::DecodeScheduler;
use tauri::{AppHandle, Manager, State};

pub struct DecodeRuntime {
    pub(crate) scheduler: Mutex<DecodeScheduler>,
    stop_flag: Arc<AtomicBool>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}

impl Default for DecodeRuntime {
    fn default() -> Self {
        Self {
            scheduler: Mutex::new(DecodeScheduler::default()),
            stop_flag: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
        }
    }
}

impl DecodeRuntime {
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
        let handle = thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                let frames = app
                    .state::<DecodeRuntime>()
                    .scheduler
                    .lock()
                    .ok()
                    .and_then(|mut scheduler| scheduler.tick_frames().ok())
                    .unwrap_or_default();
                for frame in frames {
                    let _ = crate::decode::emit_frame(&app, &frame);
                }
                thread::sleep(Duration::from_millis(16));
            }
        });
        *worker = Some(handle);
    }
}

pub struct ClipRegistry;

mod decode;
mod essentia;
mod ipc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(DecodeRuntime::default())
        .manage(ClipRegistry)
        .invoke_handler(tauri::generate_handler![
            ipc::decode_backend_name,
            ipc::open_clip_path,
            ipc::release_clip,
            ipc::stop_decode,
            ipc::probe_clip,
            ipc::start_decode,
            ipc::stage_clip_file,
            essentia::analyze_rhythm
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beat Surfer Pro desktop");
}

pub fn decode_runtime(app: &AppHandle) -> State<'_, DecodeRuntime> {
    app.state::<DecodeRuntime>()
}
