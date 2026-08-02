use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Instant;

use crate::demux::probe_mp4;
use crate::types::{DecodeError, DecodeFrame, NativeDecodeFrame};

const PREVIEW_MAX_WIDTH: u32 = 256;
const PREVIEW_MAX_HEIGHT: u32 = 144;
pub const PROGRAM_FRAME_PREFIX: &str = "__bsp_pgm__:";
pub const PREPARED_PROGRAM_FRAME_PREFIX: &str = "__bsp_pgm_prepared__:";

struct ClipLane {
    path: String,
    source_width: u32,
    source_height: u32,
    duration_us: i64,
    worker: LaneWorker,
}

pub struct ProgramLaneRequest {
    request_id: u64,
    source_id: String,
    path: String,
    source_width: u32,
    source_height: u32,
    duration_us: i64,
    start_us: i64,
    generation: u64,
    sequence: Arc<AtomicU64>,
}

pub struct PreparedProgramLane {
    request_id: u64,
    source_id: String,
    lane: ClipLane,
}

struct ProgramLane {
    source_id: String,
    lane: ClipLane,
    /// Latest transport-aligned frame decoded while this lane was on standby.
    /// It is emitted on the first worker tick after activation, so the beat
    /// cut never waits for AVAssetReader/VideoToolbox startup.
    ready: Option<NativeDecodeFrame>,
}

#[derive(Clone, Copy)]
struct WorkerTarget {
    target_us: i64,
    generation: u64,
    revision: u64,
    cache_only: bool,
    stop: bool,
}

struct WorkerMailbox {
    latest: Option<NativeDecodeFrame>,
    error: Option<String>,
    preview_cache: Vec<NativeDecodeFrame>,
    preview_cache_complete: bool,
}

/// A decoder lane with permanent thread affinity.
///
/// AVAssetReader and its VideoToolbox output are both created and consumed on
/// this worker's OS thread. The scheduler only publishes clock targets and
/// drains a one-frame mailbox, so a slow PGM seek can never block previews.
struct LaneWorker {
    control: Arc<(Mutex<WorkerTarget>, Condvar)>,
    mailbox: Arc<Mutex<WorkerMailbox>>,
    handle: Option<JoinHandle<()>>,
    sequence: Arc<AtomicU64>,
    preview_cache_us: i64,
    current_target_us: i64,
    last_target_us: i64,
    serving_preview_cache: bool,
    last_cache_timestamp_us: Option<i64>,
}

impl LaneWorker {
    #[allow(clippy::too_many_arguments)]
    fn spawn(
        frame_id: String,
        path: String,
        target_width: u32,
        target_height: u32,
        start_us: i64,
        generation: u64,
        sequence: Arc<AtomicU64>,
        preview_cache_us: i64,
    ) -> Result<Self, DecodeError> {
        let control = Arc::new((
            Mutex::new(WorkerTarget {
                target_us: start_us,
                generation,
                revision: 1,
                cache_only: false,
                stop: false,
            }),
            Condvar::new(),
        ));
        let mailbox = Arc::new(Mutex::new(WorkerMailbox {
            latest: None,
            error: None,
            preview_cache: Vec::new(),
            preview_cache_complete: false,
        }));
        let worker_control = Arc::clone(&control);
        let worker_mailbox = Arc::clone(&mailbox);
        let worker_sequence = Arc::clone(&sequence);
        let (init_tx, init_rx) = mpsc::sync_channel(1);
        let thread_name = format!("bsp-decode-{frame_id}");
        let handle = thread::Builder::new()
            .name(thread_name)
            .spawn(move || {
                run_lane_worker(
                    frame_id,
                    path,
                    target_width,
                    target_height,
                    start_us,
                    generation,
                    worker_sequence,
                    preview_cache_us,
                    worker_control,
                    worker_mailbox,
                    init_tx,
                );
            })
            .map_err(|error| DecodeError::Decode(format!("spawn decode worker: {error}")))?;

        match init_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                control,
                mailbox,
                handle: Some(handle),
                sequence,
                preview_cache_us,
                current_target_us: start_us,
                last_target_us: start_us,
                serving_preview_cache: preview_cache_us > 0,
                last_cache_timestamp_us: None,
            }),
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(DecodeError::Decode(error))
            }
            Err(error) => {
                let _ = handle.join();
                Err(DecodeError::Decode(format!(
                    "decode worker exited during startup: {error}"
                )))
            }
        }
    }

    fn set_target(&mut self, target_us: i64, generation: u64) {
        let wrapped = target_us + 100_000 < self.last_target_us;
        if wrapped && self.preview_cache_us > 0 {
            let cache_complete = self
                .mailbox
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .preview_cache_complete;
            if cache_complete {
                self.serving_preview_cache = true;
                self.last_cache_timestamp_us = None;
            }
        }
        self.current_target_us = target_us;
        self.last_target_us = target_us;

        let (lock, wake) = &*self.control;
        let mut control = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if self.serving_preview_cache {
            if !control.cache_only {
                control.cache_only = true;
                control.revision = control.revision.wrapping_add(1);
                wake.notify_one();
            }
            return;
        }
        if control.target_us == target_us && control.generation == generation {
            return;
        }
        control.target_us = target_us;
        control.generation = generation;
        control.cache_only = false;
        control.revision = control.revision.wrapping_add(1);
        wake.notify_one();
    }

    fn take_latest(&mut self) -> Option<NativeDecodeFrame> {
        let mut mailbox = self
            .mailbox
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if self.serving_preview_cache {
            if self.current_target_us <= self.preview_cache_us {
                let cached = mailbox
                    .preview_cache
                    .iter()
                    .rev()
                    .find(|frame| frame.timestamp_us <= self.current_target_us)
                    .or_else(|| mailbox.preview_cache.first());
                if let Some(frame) = cached {
                    if self.last_cache_timestamp_us != Some(frame.timestamp_us) {
                        self.last_cache_timestamp_us = Some(frame.timestamp_us);
                        let sequence = self
                            .sequence
                            .fetch_add(1, Ordering::Relaxed)
                            .wrapping_add(1);
                        return Some(frame.retained_for_sequence(sequence));
                    }
                    return None;
                }
            }
        }

        mailbox.latest.take()
    }

    fn take_error(&self) -> Option<String> {
        self.mailbox
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .error
            .take()
    }

    fn stop(&mut self) {
        let (lock, wake) = &*self.control;
        {
            let mut control = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            control.stop = true;
            control.revision = control.revision.wrapping_add(1);
            wake.notify_one();
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for LaneWorker {
    fn drop(&mut self) {
        self.stop();
    }
}

#[allow(clippy::too_many_arguments)]
fn run_lane_worker(
    frame_id: String,
    path: String,
    target_width: u32,
    target_height: u32,
    start_us: i64,
    initial_generation: u64,
    sequence: Arc<AtomicU64>,
    preview_cache_us: i64,
    control: Arc<(Mutex<WorkerTarget>, Condvar)>,
    mailbox: Arc<Mutex<WorkerMailbox>>,
    init_tx: mpsc::SyncSender<Result<(), String>>,
) {
    #[cfg(target_os = "macos")]
    let mut decoder = match crate::videotoolbox::VideoToolboxDecoder::open(
        &path,
        target_width,
        target_height,
        start_us,
    ) {
        Ok(decoder) => Some(decoder),
        Err(error) => {
            let _ = init_tx.send(Err(error.to_string()));
            return;
        }
    };

    // Preview clips are short and fixed. Decode the bounded 256x144 timeline
    // once during import, retain its IOSurfaces, then release VideoToolbox
    // before transport begins. Runtime preview playback becomes a cache lookup.
    #[cfg(target_os = "macos")]
    if preview_cache_us > 0 {
        let Some(active_decoder) = decoder.as_mut() else {
            let _ = init_tx.send(Err("preview decoder was not initialized".into()));
            return;
        };
        loop {
            let next_sequence = sequence.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
            match active_decoder.next_native_frame(&frame_id, next_sequence) {
                Ok(Some(frame)) => retain_preview_frame(&mailbox, &frame, preview_cache_us),
                Ok(None) => {
                    let mut mailbox = mailbox
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if mailbox.preview_cache.is_empty() {
                        let _ = init_tx.send(Err("preview decoder produced no frames".into()));
                        return;
                    }
                    mailbox.preview_cache_complete = true;
                    break;
                }
                Err(error) => {
                    let _ = init_tx.send(Err(error.to_string()));
                    return;
                }
            }
        }
        decoder = None;
    }

    let _ = init_tx.send(Ok(()));

    let mut pending: Option<NativeDecodeFrame> = None;
    let mut lane_generation = initial_generation;
    let mut last_target_us = start_us;
    let mut seen_revision = 0;

    loop {
        let target = {
            let (lock, wake) = &*control;
            let mut state = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            while !state.stop && state.revision == seen_revision {
                state = wake
                    .wait(state)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
            }
            *state
        };
        if target.stop {
            break;
        }
        seen_revision = target.revision;

        if target.cache_only {
            pending = None;
            #[cfg(target_os = "macos")]
            {
                decoder = None;
            }
            last_target_us = target.target_us;
            continue;
        }

        let wrapped = target.target_us + 100_000 < last_target_us;
        let jumped_forward = target.target_us > last_target_us + 500_000;
        if lane_generation != target.generation
            || wrapped
            || (jumped_forward && preview_cache_us <= 0)
        {
            pending = None;
            lane_generation = target.generation;
            #[cfg(target_os = "macos")]
            match crate::videotoolbox::VideoToolboxDecoder::open(
                &path,
                target_width,
                target_height,
                target.target_us,
            ) {
                Ok(reopened) => decoder = Some(reopened),
                Err(error) => {
                    mailbox
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .error = Some(error.to_string());
                    decoder = None;
                    last_target_us = target.target_us;
                    continue;
                }
            }
        }

        let mut chosen = None;
        if let Some(next) = pending.as_ref() {
            if next.timestamp_us <= target.target_us {
                chosen = pending.take();
            } else {
                last_target_us = target.target_us;
                continue;
            }
        }

        #[cfg(target_os = "macos")]
        if let Some(active_decoder) = decoder.as_mut() {
            for _ in 0..240 {
                let next_sequence = sequence.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
                match active_decoder.next_native_frame(&frame_id, next_sequence) {
                    Ok(Some(frame)) if frame.timestamp_us <= target.target_us => {
                        retain_preview_frame(&mailbox, &frame, preview_cache_us);
                        chosen = Some(frame);
                    }
                    Ok(Some(frame)) => {
                        retain_preview_frame(&mailbox, &frame, preview_cache_us);
                        pending = Some(frame);
                        break;
                    }
                    Ok(None) => break,
                    Err(error) => {
                        mailbox
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner())
                            .error = Some(error.to_string());
                        decoder = None;
                        break;
                    }
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        if chosen.is_none() {
            let next_sequence = sequence.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
            match synthetic_frame(&frame_id, &path, target.target_us, next_sequence) {
                Ok(frame) => chosen = Some(NativeDecodeFrame::from_cpu(frame)),
                Err(error) => {
                    mailbox
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .error = Some(error.to_string());
                }
            }
        }

        if let Some(frame) = chosen {
            mailbox
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .latest = Some(frame);
        }
        last_target_us = target.target_us;
    }
}

fn retain_preview_frame(
    mailbox: &Arc<Mutex<WorkerMailbox>>,
    frame: &NativeDecodeFrame,
    preview_cache_us: i64,
) {
    if preview_cache_us <= 0 || frame.timestamp_us < 0 || frame.timestamp_us > preview_cache_us {
        return;
    }
    let mut mailbox = mailbox
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if mailbox
        .preview_cache
        .last()
        .is_some_and(|cached| cached.timestamp_us >= frame.timestamp_us)
    {
        return;
    }
    mailbox.preview_cache.push(frame.retained_for_sequence(0));
    // Container duration often extends a fraction beyond the final video
    // sample. Being within 250ms is enough to prove the immutable frame cache
    // covers the complete visible loop.
    if frame.timestamp_us >= preview_cache_us.saturating_sub(250_000) {
        mailbox.preview_cache_complete = true;
    }
}

struct TransportAnchor {
    position_us: i64,
    playback_rate: f64,
    playing: bool,
    generation: u64,
    updated_at: Instant,
    source_timelines: HashMap<String, (i64, f64)>,
}

impl Default for TransportAnchor {
    fn default() -> Self {
        Self {
            position_us: 0,
            playback_rate: 1.0,
            playing: false,
            generation: 0,
            updated_at: Instant::now(),
            source_timelines: HashMap::new(),
        }
    }
}

impl TransportAnchor {
    fn current_position_us(&self) -> i64 {
        if !self.playing {
            return self.position_us;
        }
        let elapsed_us = self.updated_at.elapsed().as_micros() as f64;
        self.position_us
            .saturating_add((elapsed_us * self.playback_rate) as i64)
    }

    fn current_source_position_us(&self, source_id: &str) -> i64 {
        let Some((position_us, rate)) = self.source_timelines.get(source_id) else {
            return self.current_position_us();
        };
        if !self.playing {
            return *position_us;
        }
        position_us.saturating_add((self.updated_at.elapsed().as_micros() as f64 * rate) as i64)
    }
}

/// Slot-owned native decoders driven by the authoritative audio transport.
pub struct DecodeScheduler {
    clips: HashMap<String, ClipLane>,
    program: Option<ProgramLane>,
    prepared_program: Option<ProgramLane>,
    running: bool,
    sequence: Arc<AtomicU64>,
    transport: TransportAnchor,
    program_source: Option<String>,
    program_request_id: u64,
    prepared_program_request_id: u64,
    last_worker_error: Option<String>,
}

impl Default for DecodeScheduler {
    fn default() -> Self {
        Self {
            clips: HashMap::new(),
            program: None,
            prepared_program: None,
            running: false,
            sequence: Arc::new(AtomicU64::new(0)),
            transport: TransportAnchor::default(),
            program_source: None,
            program_request_id: 0,
            prepared_program_request_id: 0,
            last_worker_error: None,
        }
    }
}

impl DecodeScheduler {
    pub fn open_clip(&mut self, module_id: String, path: String) -> Result<(), DecodeError> {
        let probe = probe_mp4(&path).map_err(DecodeError::Demux)?;
        if !probe.track_found {
            return Err(DecodeError::Demux("video track not found".into()));
        }
        let source_width = probe.width.unwrap_or(1280).max(1);
        let source_height = probe.height.unwrap_or(720).max(1);
        let duration_us = probe.duration_us.unwrap_or(0).max(0);
        let start_us = 0;
        // Preview decoders are permanently bounded. PGM owns a separate
        // source-resolution decoder so selecting a live slot never promotes
        // that slot's preview transport to full-resolution frames.
        let (target_width, target_height) = target_dimensions(source_width, source_height, false);
        let worker = LaneWorker::spawn(
            module_id.clone(),
            path.clone(),
            target_width,
            target_height,
            start_us,
            self.transport.generation,
            Arc::clone(&self.sequence),
            duration_us,
        )?;

        self.clips.insert(
            module_id.clone(),
            ClipLane {
                path,
                source_width,
                source_height,
                duration_us,
                worker,
            },
        );
        if self.program_source.as_deref() == Some(module_id.as_str()) {
            self.program = None;
            self.set_program_source(Some(module_id))?;
        }
        Ok(())
    }

    pub fn release_clip(&mut self, module_id: &str) {
        self.clips.remove(module_id);
        if self.program_source.as_deref() == Some(module_id) {
            self.program_request_id = self.program_request_id.wrapping_add(1);
            self.program_source = None;
            self.program = None;
        }
        if self
            .prepared_program
            .as_ref()
            .is_some_and(|lane| lane.source_id == module_id)
        {
            self.prepared_program_request_id = self.prepared_program_request_id.wrapping_add(1);
            self.prepared_program = None;
        }
    }

    pub fn stop(&mut self) {
        self.clips.clear();
        self.program = None;
        self.prepared_program = None;
        self.program_source = None;
        self.program_request_id = self.program_request_id.wrapping_add(1);
        self.prepared_program_request_id = self.prepared_program_request_id.wrapping_add(1);
        self.running = false;
        self.sequence.store(0, Ordering::Relaxed);
        self.last_worker_error = None;
    }

    pub fn start(&mut self) {
        self.running = true;
    }

    pub fn is_running(&self) -> bool {
        self.running && !self.clips.is_empty()
    }

    pub fn clip_count(&self) -> usize {
        self.clips.len()
    }

    pub fn program_decoder_active(&self) -> bool {
        self.program.is_some()
    }

    pub fn update_transport(
        &mut self,
        position_us: i64,
        playing: bool,
        playback_rate: f64,
        generation: u64,
        source_timelines: HashMap<String, (i64, f64)>,
    ) {
        self.transport = TransportAnchor {
            position_us: position_us.max(0),
            playback_rate: playback_rate.clamp(0.01, 4.0),
            playing,
            generation,
            updated_at: Instant::now(),
            source_timelines,
        };
    }

    pub fn set_program_source(&mut self, source_id: Option<String>) -> Result<(), DecodeError> {
        let Some(request) = self.begin_program_source(source_id)? else {
            return Ok(());
        };
        let prepared = Self::open_program_lane(request)?;
        self.commit_program_lane(prepared);
        Ok(())
    }

    /// Mark the requested PGM source under the scheduler lock, then return all
    /// immutable data needed to open AVAssetReader after that lock is released.
    pub fn begin_program_source(
        &mut self,
        source_id: Option<String>,
    ) -> Result<Option<ProgramLaneRequest>, DecodeError> {
        if self.program_source == source_id && self.program.is_some() {
            return Ok(None);
        }
        self.program_request_id = self.program_request_id.wrapping_add(1);
        let request_id = self.program_request_id;
        let Some(source_id) = source_id else {
            self.program_source = None;
            self.program = None;
            return Ok(None);
        };

        if self
            .prepared_program
            .as_ref()
            .is_some_and(|lane| lane.source_id == source_id)
        {
            self.program_source = Some(source_id);
            self.program = self.prepared_program.take();
            return Ok(None);
        }

        self.program_source = Some(source_id.clone());
        self.program = None;
        let Some(preview) = self.clips.get(&source_id) else {
            return Ok(None);
        };
        let start_us = looped_target(
            self.transport.current_source_position_us(&source_id),
            preview.duration_us,
        );
        Ok(Some(ProgramLaneRequest {
            request_id,
            source_id,
            path: preview.path.clone(),
            source_width: preview.source_width,
            source_height: preview.source_height,
            duration_us: preview.duration_us,
            start_us,
            generation: self.transport.generation,
            sequence: Arc::clone(&self.sequence),
        }))
    }

    /// Build a full-resolution standby lane without changing the live PGM
    /// source. Only one standby is retained because the transport scheduler
    /// knows exactly which source is due at the next quantized boundary.
    pub fn begin_prepare_program_source(
        &mut self,
        source_id: Option<String>,
    ) -> Result<Option<ProgramLaneRequest>, DecodeError> {
        let Some(source_id) = source_id else {
            self.prepared_program_request_id = self.prepared_program_request_id.wrapping_add(1);
            self.prepared_program = None;
            return Ok(None);
        };
        if self.program_source.as_deref() == Some(source_id.as_str())
            || self
                .prepared_program
                .as_ref()
                .is_some_and(|lane| lane.source_id == source_id)
        {
            return Ok(None);
        }
        let Some(preview) = self.clips.get(&source_id) else {
            return Ok(None);
        };
        self.prepared_program_request_id = self.prepared_program_request_id.wrapping_add(1);
        let request_id = self.prepared_program_request_id;
        let start_us = looped_target(
            self.transport.current_source_position_us(&source_id),
            preview.duration_us,
        );
        Ok(Some(ProgramLaneRequest {
            request_id,
            source_id,
            path: preview.path.clone(),
            source_width: preview.source_width,
            source_height: preview.source_height,
            duration_us: preview.duration_us,
            start_us,
            generation: self.transport.generation,
            sequence: Arc::clone(&self.sequence),
        }))
    }

    /// Potentially expensive AVFoundation/VideoToolbox open. The Tauri IPC
    /// layer calls this without holding the scheduler mutex so preview decode
    /// never stalls while a beat cut warms its source-resolution lane.
    pub fn open_program_lane(
        request: ProgramLaneRequest,
    ) -> Result<PreparedProgramLane, DecodeError> {
        let frame_id = format!("{PROGRAM_FRAME_PREFIX}{}", request.source_id);
        let (target_width, target_height) =
            target_dimensions(request.source_width, request.source_height, true);
        let worker = LaneWorker::spawn(
            frame_id,
            request.path.clone(),
            target_width,
            target_height,
            request.start_us,
            request.generation,
            request.sequence,
            0,
        )?;
        let lane = ClipLane {
            path: request.path,
            source_width: request.source_width,
            source_height: request.source_height,
            duration_us: request.duration_us,
            worker,
        };
        Ok(PreparedProgramLane {
            request_id: request.request_id,
            source_id: request.source_id,
            lane,
        })
    }

    pub fn commit_program_lane(&mut self, prepared: PreparedProgramLane) -> bool {
        if prepared.request_id != self.program_request_id
            || self.program_source.as_deref() != Some(prepared.source_id.as_str())
        {
            return false;
        }
        self.program = Some(ProgramLane {
            source_id: prepared.source_id,
            lane: prepared.lane,
            ready: None,
        });
        true
    }

    pub fn commit_prepared_program_lane(&mut self, prepared: PreparedProgramLane) -> bool {
        if prepared.request_id != self.prepared_program_request_id
            || self.program_source.as_deref() == Some(prepared.source_id.as_str())
        {
            return false;
        }
        self.prepared_program = Some(ProgramLane {
            source_id: prepared.source_id,
            lane: prepared.lane,
            ready: None,
        });
        true
    }

    /// Transfer the already-decoded standby frame directly to the compositor
    /// on the cut command. This avoids waiting behind a full serial preview
    /// decode pass before the PGM ownership flip can be presented.
    pub fn take_program_ready_frame(&mut self) -> Option<NativeDecodeFrame> {
        let program = self.program.as_mut()?;
        if let Some(error) = program.lane.worker.take_error() {
            self.last_worker_error = Some(error);
        }
        if let Some(frame) = program.lane.worker.take_latest() {
            program.ready = Some(frame);
        }
        program.ready.take()
    }

    pub fn take_last_worker_error(&mut self) -> Option<String> {
        self.last_worker_error.take()
    }

    /// Transitional byte-producing API for the WebView renderer. The desktop
    /// compositor must call `tick_native_frames` instead.
    #[cfg(feature = "cpu-frame-bridge")]
    pub fn tick_frames(&mut self) -> Result<Vec<DecodeFrame>, DecodeError> {
        self.tick_native_frames()?
            .into_iter()
            .map(NativeDecodeFrame::into_cpu_frame)
            .collect()
    }

    /// Decode only as far as the shared audio timeline requires while keeping
    /// pixel storage native. Future frames stay in a one-frame lane buffer;
    /// stale frames are dropped in Rust.
    pub fn tick_native_frames(&mut self) -> Result<Vec<NativeDecodeFrame>, DecodeError> {
        if !self.is_running() {
            return Ok(Vec::new());
        }
        let generation = self.transport.generation;
        let mut frames = Vec::with_capacity(self.clips.len());
        for (module_id, lane) in &mut self.clips {
            let transport_target_us = self.transport.current_source_position_us(module_id);
            let target_us = looped_target(transport_target_us, lane.duration_us);
            lane.worker.set_target(target_us, generation);
            if let Some(error) = lane.worker.take_error() {
                self.last_worker_error = Some(format!("{module_id}: {error}"));
            }
            if let Some(frame) = lane.worker.take_latest() {
                frames.push(frame);
            }
        }

        if let Some(prepared) = self.prepared_program.as_mut() {
            let target_us = looped_target(
                self.transport
                    .current_source_position_us(&prepared.source_id),
                prepared.lane.duration_us,
            );
            prepared.lane.worker.set_target(target_us, generation);
            if let Some(error) = prepared.lane.worker.take_error() {
                self.last_worker_error = Some(format!("prepared {}: {error}", prepared.source_id));
            }
            if let Some(frame) = prepared.lane.worker.take_latest() {
                let mut hidden = frame.retained_for_sequence(frame.sequence);
                hidden.module_id = format!(
                    "{PREPARED_PROGRAM_FRAME_PREFIX}{}",
                    prepared.source_id
                );
                frames.push(hidden);
                prepared.ready = Some(frame);
            }
        }

        if let Some(program) = self.program.as_mut() {
            let target_us = looped_target(
                self.transport
                    .current_source_position_us(&program.source_id),
                program.lane.duration_us,
            );
            program.lane.worker.set_target(target_us, generation);
            if let Some(error) = program.lane.worker.take_error() {
                self.last_worker_error = Some(format!("program {}: {error}", program.source_id));
            }
            if let Some(frame) = program
                .ready
                .take()
                .or_else(|| program.lane.worker.take_latest())
            {
                frames.push(frame);
            }
        }
        Ok(frames)
    }
}

fn target_dimensions(source_width: u32, source_height: u32, program: bool) -> (u32, u32) {
    if program {
        return (source_width, source_height);
    }
    let (max_width, max_height) = (PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT);
    let scale = (max_width as f64 / source_width as f64)
        .min(max_height as f64 / source_height as f64)
        .min(1.0);
    let width = ((source_width as f64 * scale).round() as u32).max(2) & !1;
    let height = ((source_height as f64 * scale).round() as u32).max(2) & !1;
    (width, height)
}

fn looped_target(target_us: i64, duration_us: i64) -> i64 {
    if duration_us > 0 {
        target_us.rem_euclid(duration_us)
    } else {
        target_us.max(0)
    }
}

/// Synthetic pixels exist only for non-macOS compile/test coverage. The macOS
/// production backend never falls back when hardware decode fails.
#[allow(dead_code)]
pub fn synthetic_frame(
    module_id: &str,
    path: &str,
    timestamp_us: i64,
    sequence: u64,
) -> Result<DecodeFrame, DecodeError> {
    let probe = probe_mp4(path).map_err(DecodeError::Demux)?;
    let width = probe.width.unwrap_or(1280);
    let height = probe.height.unwrap_or(720);
    let mut bgra = vec![0u8; (width * height * 4) as usize];
    let phase = ((timestamp_us / 16_667).max(0) as u32).wrapping_add(module_id.len() as u32);
    for y in 0..height {
        for x in 0..width {
            let index = ((y * width + x) * 4) as usize;
            bgra[index] = ((phase / 7) % 256) as u8;
            bgra[index + 1] = ((y + phase / 3) % 256) as u8;
            bgra[index + 2] = ((x + phase) % 256) as u8;
            bgra[index + 3] = 255;
        }
    }
    Ok(DecodeFrame {
        module_id: module_id.to_string(),
        width,
        height,
        timestamp_us,
        sequence,
        bgra,
    })
}

#[cfg(test)]
mod tests {
    use super::target_dimensions;

    #[test]
    fn preview_dimensions_are_bounded_and_aspect_preserving() {
        assert_eq!(target_dimensions(1920, 1080, false), (256, 144));
        assert_eq!(target_dimensions(1080, 1920, false), (80, 144));
        assert_eq!(target_dimensions(320, 180, false), (256, 144));
    }

    #[test]
    fn program_dimensions_keep_source_quality() {
        assert_eq!(target_dimensions(1920, 1080, true), (1920, 1080));
        assert_eq!(target_dimensions(640, 360, true), (640, 360));
    }
}
