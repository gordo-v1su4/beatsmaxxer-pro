use std::collections::{HashMap, VecDeque};
use std::num::NonZeroU64;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use bsp_decode::{
    NativeDecodeFrame, SpeedRampProfile, PREPARED_PROGRAM_FRAME_PREFIX, PROGRAM_FRAME_PREFIX,
};
use bytemuck::{Pod, Zeroable};
use tauri::WebviewWindow;
use wgpu::util::DeviceExt;

use super::macos_import::import_bgra_iosurface;
use super::macos_view::attach_overlay;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSurfaceRect {
    pub surface_id: String,
    #[serde(default)]
    pub effect_module_id: String,
    #[serde(default)]
    pub effect_mode: f32,
    #[serde(default = "default_mix_percent")]
    pub mix: f32,
    #[serde(default = "default_effect_percent")]
    pub p0: f32,
    #[serde(default = "default_effect_percent")]
    pub p1: f32,
    #[serde(default = "default_effect_percent")]
    pub p2: f32,
    #[serde(default = "default_effect_percent")]
    pub p3: f32,
    #[serde(default = "default_effect_percent")]
    pub p4: f32,
    #[serde(default = "default_effect_percent")]
    pub p5: f32,
    #[serde(default = "default_effect_percent")]
    pub p6: f32,
    #[serde(default = "default_effect_percent")]
    pub p7: f32,
    #[serde(default = "default_effect_percent")]
    pub p8: f32,
    #[serde(default = "default_effect_percent")]
    pub p9: f32,
    #[serde(default)]
    pub accent_r: f32,
    #[serde(default)]
    pub accent_g: f32,
    #[serde(default)]
    pub accent_b: f32,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default = "default_visible")]
    pub visible: bool,
}

fn default_visible() -> bool {
    true
}

fn default_effect_percent() -> f32 {
    50.0
}

fn default_mix_percent() -> f32 {
    100.0
}

#[derive(Debug, Clone, Copy)]
pub struct NativeEffectTransport {
    pub position_seconds: f32,
    pub beat_position: f32,
    pub beat_phase: f32,
    pub bpm: f32,
    pub playback_rate: f32,
    pub playing: bool,
    pub generation: u64,
    pub fixed_step_seconds: f32,
    pub fixed_step_index: u32,
    pub fixed_step_phase: f32,
    pub amplitude: f32,
    pub bass_amp: f32,
    pub pitch_semitones: f32,
    pub time_sampler_accent_position_seconds: f32,
    pub time_sampler_accent_mode: f32,
}

impl Default for NativeEffectTransport {
    fn default() -> Self {
        Self {
            position_seconds: 0.0,
            beat_position: 0.0,
            beat_phase: 0.0,
            bpm: 128.0,
            playback_rate: 1.0,
            playing: false,
            generation: 0,
            fixed_step_seconds: 1.0 / 60.0,
            fixed_step_index: 0,
            fixed_step_phase: 0.0,
            amplitude: 0.0,
            bass_amp: 0.0,
            pitch_semitones: 0.0,
            time_sampler_accent_position_seconds: -1.0,
            time_sampler_accent_mode: 2.0,
        }
    }
}

pub struct NativeCompositorMetrics {
    pub zero_copy_frames: AtomicU64,
    pub iosurface_imports: AtomicU64,
    pub iosurface_import_failures: AtomicU64,
    pub gpu_submissions: AtomicU64,
    pub presented_frames: AtomicU64,
    pub active: AtomicBool,
    timing: Mutex<NativeCompositorTiming>,
}

const MAX_PRESENTATION_INTERVALS: usize = 4_096;
const PREPARED_SURFACE_PREFIX: &str = "__prepared_surface__:";
const MAX_IMPORTED_PREVIEW_TEXTURES: usize = 8_192;
const MAX_NATIVE_SURFACES: usize = 12;
const EFFECT_UNIFORM_STRIDE: usize = 256;

#[derive(Default)]
struct NativeCompositorTiming {
    last_presented_at: Option<Instant>,
    intervals_us: VecDeque<u64>,
    surfaces: HashMap<String, NativeSurfaceSnapshot>,
    pending_cut: Option<PendingProgramCut>,
    cuts: Vec<NativeCutSnapshot>,
    pgm_black_frames: u64,
}

struct PendingProgramCut {
    source_id: String,
    requested_at: Instant,
    black_frames: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCutSnapshot {
    pub source_id: String,
    pub latency_us: u64,
    pub black_frames: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSurfaceSnapshot {
    pub surface_id: String,
    pub source_id: String,
    pub effect_module_id: String,
    pub effect_mode: f32,
    pub effect_requested_frame: u64,
    pub effect_applied_frame: u64,
    pub effect_mix: f32,
    pub effect_p0: f32,
    pub effect_p1: f32,
    pub effect_p2: f32,
    pub effect_p3: f32,
    pub effect_params_requested_frame: u64,
    pub effect_params_applied_frame: u64,
    pub width: u32,
    pub height: u32,
    pub display_width: f32,
    pub display_height: f32,
    pub timestamp_us: i64,
    pub sequence: u64,
    pub source_frame_changes: u64,
    pub large_timestamp_jumps: u64,
    pub timestamp_regressions: u64,
    pub max_backward_timestamp_us: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCompositorSnapshot {
    pub presented_frames: u64,
    pub intervals_us: Vec<u64>,
    pub surfaces: HashMap<String, NativeSurfaceSnapshot>,
    pub cuts: Vec<NativeCutSnapshot>,
    pub pgm_black_frames: u64,
    pub pending_program_source: Option<String>,
}

impl Default for NativeCompositorMetrics {
    fn default() -> Self {
        Self {
            zero_copy_frames: AtomicU64::new(0),
            iosurface_imports: AtomicU64::new(0),
            iosurface_import_failures: AtomicU64::new(0),
            gpu_submissions: AtomicU64::new(0),
            presented_frames: AtomicU64::new(0),
            active: AtomicBool::new(false),
            timing: Mutex::new(NativeCompositorTiming::default()),
        }
    }
}

impl NativeCompositorMetrics {
    fn record_present(
        &self,
        frames: &HashMap<String, ImportedFrame>,
        rects: &[NativeSurfaceRect],
        layout_requested_frame: u64,
    ) {
        let now = Instant::now();
        let Ok(mut timing) = self.timing.lock() else {
            return;
        };
        if let Some(previous) = timing.last_presented_at.replace(now) {
            if timing.intervals_us.len() == MAX_PRESENTATION_INTERVALS {
                timing.intervals_us.pop_front();
            }
            timing
                .intervals_us
                .push_back(now.duration_since(previous).as_micros() as u64);
        }
        let presented_frame = self.presented_frames.load(Ordering::Relaxed);
        let previous_surfaces = std::mem::take(&mut timing.surfaces);
        timing.surfaces = frames
            .iter()
            .filter(|(surface_id, _)| !surface_id.starts_with(PREPARED_SURFACE_PREFIX))
            .map(|(surface_id, frame)| {
                let effect = rects.iter().find(|rect| rect.surface_id == *surface_id);
                let effect_module_id = effect
                    .map(|rect| rect.effect_module_id.clone())
                    .unwrap_or_default();
                let effect_mode = effect.map(|rect| rect.effect_mode).unwrap_or_default();
                let effect_applied_frame = previous_surfaces
                    .get(surface_id)
                    .filter(|previous| {
                        previous.effect_module_id == effect_module_id
                            && previous.effect_mode == effect_mode
                    })
                    .map(|previous| previous.effect_applied_frame)
                    .unwrap_or(presented_frame);
                let effect_requested_frame = previous_surfaces
                    .get(surface_id)
                    .filter(|previous| {
                        previous.effect_module_id == effect_module_id
                            && previous.effect_mode == effect_mode
                    })
                    .map(|previous| previous.effect_requested_frame)
                    .unwrap_or(layout_requested_frame);
                let (effect_mix, effect_p0, effect_p1, effect_p2, effect_p3) = effect
                    .map(|rect| (rect.mix, rect.p0, rect.p1, rect.p2, rect.p3))
                    .unwrap_or_default();
                let params_unchanged = previous_surfaces.get(surface_id).is_some_and(|previous| {
                    previous.effect_mix == effect_mix
                        && previous.effect_p0 == effect_p0
                        && previous.effect_p1 == effect_p1
                        && previous.effect_p2 == effect_p2
                        && previous.effect_p3 == effect_p3
                });
                let effect_params_applied_frame = previous_surfaces
                    .get(surface_id)
                    .filter(|_| params_unchanged)
                    .map(|previous| previous.effect_params_applied_frame)
                    .unwrap_or(presented_frame);
                let effect_params_requested_frame = previous_surfaces
                    .get(surface_id)
                    .filter(|_| params_unchanged)
                    .map(|previous| previous.effect_params_requested_frame)
                    .unwrap_or(layout_requested_frame);
                let previous_source = previous_surfaces
                    .get(surface_id)
                    .filter(|previous| previous.source_id == frame.source_id);
                let timestamp_delta = previous_source
                    .map(|previous| frame.timestamp_us - previous.timestamp_us)
                    .unwrap_or_default();
                let source_frame_changes = previous_source
                    .map(|previous| previous.source_frame_changes)
                    .unwrap_or_default()
                    + u64::from(previous_source.is_some() && timestamp_delta != 0);
                let large_timestamp_jumps = previous_source
                    .map(|previous| previous.large_timestamp_jumps)
                    .unwrap_or_default()
                    + u64::from(previous_source.is_some() && timestamp_delta.abs() > 500_000);
                // SpeedRamp always advances forward. A large negative delta is
                // only valid when the short clip loops from its tail to head.
                // Track smaller regressions as direct evidence of a bad sparse
                // anchor correction rather than inferring smoothness from FPS.
                let backward_us = timestamp_delta.saturating_neg().max(0) as u64;
                let unexpected_speed_ramp_regression = previous_source.is_some()
                    && (effect_mode - 2.0).abs() < 0.5
                    && timestamp_delta < -50_000
                    && timestamp_delta > -5_000_000;
                let timestamp_regressions = previous_source
                    .map(|previous| previous.timestamp_regressions)
                    .unwrap_or_default()
                    + u64::from(unexpected_speed_ramp_regression);
                let max_backward_timestamp_us = previous_source
                    .map(|previous| previous.max_backward_timestamp_us)
                    .unwrap_or_default()
                    .max(if unexpected_speed_ramp_regression {
                        backward_us
                    } else {
                        0
                    });
                (
                    surface_id.clone(),
                    NativeSurfaceSnapshot {
                        surface_id: surface_id.clone(),
                        source_id: frame.source_id.clone(),
                        effect_module_id,
                        effect_mode,
                        effect_requested_frame,
                        effect_applied_frame,
                        effect_mix,
                        effect_p0,
                        effect_p1,
                        effect_p2,
                        effect_p3,
                        effect_params_requested_frame,
                        effect_params_applied_frame,
                        width: frame.width,
                        height: frame.height,
                        display_width: effect.map(|rect| rect.width).unwrap_or_default(),
                        display_height: effect.map(|rect| rect.height).unwrap_or_default(),
                        timestamp_us: frame.timestamp_us,
                        sequence: frame.sequence,
                        source_frame_changes,
                        large_timestamp_jumps,
                        timestamp_regressions,
                        max_backward_timestamp_us,
                    },
                )
            })
            .collect();
        let pgm_source = frames.get("pgm").map(|frame| frame.source_id.as_str());
        if pgm_source.is_none() {
            timing.pgm_black_frames = timing.pgm_black_frames.saturating_add(1);
            if let Some(pending) = timing.pending_cut.as_mut() {
                pending.black_frames = pending.black_frames.saturating_add(1);
            }
        }
        if timing
            .pending_cut
            .as_ref()
            .is_some_and(|pending| pgm_source == Some(pending.source_id.as_str()))
        {
            if let Some(pending) = timing.pending_cut.take() {
                timing.cuts.push(NativeCutSnapshot {
                    source_id: pending.source_id,
                    latency_us: now.duration_since(pending.requested_at).as_micros() as u64,
                    black_frames: pending.black_frames,
                });
            }
        }
    }

    fn request_program_source(&self, source_id: Option<String>, requested_at: Instant) {
        let Ok(mut timing) = self.timing.lock() else {
            return;
        };
        timing.pending_cut = source_id.map(|source_id| PendingProgramCut {
            source_id,
            requested_at,
            black_frames: 0,
        });
    }

    fn reset(&self) {
        self.zero_copy_frames.store(0, Ordering::Relaxed);
        self.iosurface_imports.store(0, Ordering::Relaxed);
        self.iosurface_import_failures.store(0, Ordering::Relaxed);
        self.gpu_submissions.store(0, Ordering::Relaxed);
        self.presented_frames.store(0, Ordering::Relaxed);
        if let Ok(mut timing) = self.timing.lock() {
            *timing = NativeCompositorTiming::default();
        }
    }

    fn snapshot(&self) -> NativeCompositorSnapshot {
        let timing = self.timing.lock().ok();
        NativeCompositorSnapshot {
            presented_frames: self.presented_frames.load(Ordering::Relaxed),
            intervals_us: timing
                .as_ref()
                .map(|timing| timing.intervals_us.iter().copied().collect())
                .unwrap_or_default(),
            surfaces: timing
                .as_ref()
                .map(|timing| timing.surfaces.clone())
                .unwrap_or_default(),
            cuts: timing
                .as_ref()
                .map(|timing| timing.cuts.clone())
                .unwrap_or_default(),
            pgm_black_frames: timing
                .as_ref()
                .map(|timing| timing.pgm_black_frames)
                .unwrap_or_default(),
            pending_program_source: timing
                .as_ref()
                .and_then(|timing| timing.pending_cut.as_ref())
                .map(|pending| pending.source_id.clone()),
        }
    }
}

enum Command {
    Resize(u32, u32),
    Frames(Vec<NativeDecodeFrame>),
    TestPattern(bool),
    Shutdown,
}

#[derive(Default)]
struct ProgramSourceMailbox {
    generation: u64,
    source_id: Option<String>,
    requested_at: Option<Instant>,
}

#[derive(Default)]
struct LayoutMailbox {
    generation: u64,
    requested_frame: u64,
    rects: Vec<NativeSurfaceRect>,
}

struct NativeControlMailboxes {
    program_source: Mutex<ProgramSourceMailbox>,
    layout: Mutex<LayoutMailbox>,
    effect_transport: Mutex<(NativeEffectTransport, Instant)>,
}

impl Default for NativeControlMailboxes {
    fn default() -> Self {
        Self {
            program_source: Mutex::new(ProgramSourceMailbox::default()),
            layout: Mutex::new(LayoutMailbox::default()),
            effect_transport: Mutex::new((NativeEffectTransport::default(), Instant::now())),
        }
    }
}

pub struct NativeCompositorState {
    sender: Mutex<Option<Sender<Command>>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    controls: Arc<NativeControlMailboxes>,
    pub metrics: Arc<NativeCompositorMetrics>,
}

impl Default for NativeCompositorState {
    fn default() -> Self {
        Self {
            sender: Mutex::new(None),
            worker: Mutex::new(None),
            controls: Arc::new(NativeControlMailboxes::default()),
            metrics: Arc::new(NativeCompositorMetrics::default()),
        }
    }
}

impl NativeCompositorState {
    pub fn attach(&self, window: &WebviewWindow) -> Result<(), String> {
        if self
            .sender
            .lock()
            .map_err(|_| "native compositor sender poisoned".to_string())?
            .is_some()
        {
            return Ok(());
        }
        let size = window.inner_size().map_err(|error| error.to_string())?;
        let handle = attach_overlay(window.ns_view().map_err(|error| error.to_string())?)?;
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::METAL,
            ..Default::default()
        });
        let surface = instance
            .create_surface(Arc::new(handle))
            .map_err(|error| format!("create native compositor surface: {error}"))?;
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: Some(&surface),
        }))
        .ok_or_else(|| "no Metal adapter supports the native compositor surface".to_string())?;
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("Beat Surfer native compositor"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))
        .map_err(|error| format!("request native compositor device: {error}"))?;
        let capabilities = surface.get_capabilities(&adapter);
        let format = capabilities
            .formats
            .iter()
            .copied()
            .find(|format| *format == wgpu::TextureFormat::Bgra8Unorm)
            .unwrap_or(capabilities.formats[0]);
        let alpha_mode = capabilities
            .alpha_modes
            .iter()
            .copied()
            // wgpu's Metal backend advertises PostMultiplied, not
            // PreMultiplied. Falling back to Auto leaves the CAMetalLayer
            // opaque and blacks out the WebView beneath this overlay.
            .find(|mode| *mode == wgpu::CompositeAlphaMode::PostMultiplied)
            .unwrap_or(wgpu::CompositeAlphaMode::Auto);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: size.width.max(1),
            height: size.height.max(1),
            present_mode: wgpu::PresentMode::AutoVsync,
            // Beat cuts must be visible on the very next refresh. Allowing two
            // CAMetalLayer frames in flight made an already-imported PGM
            // promotion measure as roughly 30ms on a 60Hz display.
            desired_maximum_frame_latency: 1,
            alpha_mode,
            view_formats: Vec::new(),
        };
        surface.configure(&device, &config);

        let (sender, receiver) = mpsc::channel();
        let metrics = Arc::clone(&self.metrics);
        let controls = Arc::clone(&self.controls);
        metrics.active.store(true, Ordering::Release);
        let worker = thread::Builder::new()
            .name("bsp-native-compositor".into())
            .spawn(move || {
                run_renderer(receiver, surface, device, queue, config, metrics, controls);
            })
            .map_err(|error| format!("spawn native compositor: {error}"))?;
        *self
            .sender
            .lock()
            .map_err(|_| "native compositor sender poisoned".to_string())? = Some(sender);
        *self
            .worker
            .lock()
            .map_err(|_| "native compositor worker poisoned".to_string())? = Some(worker);
        Ok(())
    }

    fn send(&self, command: Command) -> Result<(), String> {
        self.sender
            .lock()
            .map_err(|_| "native compositor sender poisoned".to_string())?
            .as_ref()
            .ok_or_else(|| "native compositor is not attached".to_string())?
            .send(command)
            .map_err(|_| "native compositor worker stopped".to_string())
    }

    pub fn resize(&self, width: u32, height: u32) {
        let _ = self.send(Command::Resize(width.max(1), height.max(1)));
    }

    pub fn update_layout(&self, rects: Vec<NativeSurfaceRect>) -> Result<(), String> {
        let mut mailbox = self
            .controls
            .layout
            .lock()
            .map_err(|_| "native compositor layout mailbox poisoned".to_string())?;
        mailbox.generation = mailbox.generation.wrapping_add(1);
        mailbox.requested_frame = self.metrics.presented_frames.load(Ordering::Relaxed);
        mailbox.rects = rects;
        Ok(())
    }

    pub fn update_effect_transport(&self, transport: NativeEffectTransport) {
        if let Ok(mut anchor) = self.controls.effect_transport.lock() {
            *anchor = (transport, Instant::now());
        }
    }

    pub fn submit_frames(&self, frames: Vec<NativeDecodeFrame>) -> Result<(), String> {
        if frames.is_empty() {
            return Ok(());
        }
        self.send(Command::Frames(frames))
    }

    pub fn set_test_pattern(&self, enabled: bool) -> Result<(), String> {
        self.send(Command::TestPattern(enabled))
    }

    pub fn reset_metrics(&self) {
        self.metrics.reset();
    }

    pub fn metrics_snapshot(&self) -> NativeCompositorSnapshot {
        self.metrics.snapshot()
    }

    pub fn request_program_source(&self, source_id: Option<String>) {
        if let Ok(mut mailbox) = self.controls.program_source.lock() {
            mailbox.generation = mailbox.generation.wrapping_add(1);
            mailbox.source_id = source_id;
            mailbox.requested_at = Some(Instant::now());
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut sender) = self.sender.lock() {
            if let Some(sender) = sender.take() {
                let _ = sender.send(Command::Shutdown);
            }
        }
        if let Some(worker) = self.worker.lock().ok().and_then(|mut worker| worker.take()) {
            let _ = worker.join();
        }
        self.metrics.active.store(false, Ordering::Release);
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    texcoord: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniform {
    clock: [f32; 4],
    levels: [f32; 4],
    params: [f32; 4],
    transport: [f32; 4],
    accent: [f32; 4],
}

struct ImportedTexture {
    _owner: NativeDecodeFrame,
    // Keep the imported wgpu wrapper alive explicitly for the full bind-group
    // lifetime. `_owner` independently retains the CVPixelBuffer/IOSurface.
    _texture: wgpu::Texture,
    bind_group: wgpu::BindGroup,
}

struct ImportedFrame {
    texture: Rc<ImportedTexture>,
    source_id: String,
    width: u32,
    height: u32,
    timestamp_us: i64,
    sequence: u64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct RectGeometryKey {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    viewport_width: u32,
    viewport_height: u32,
    source_width: u32,
    source_height: u32,
}

impl RectGeometryKey {
    fn new(
        rect: &NativeSurfaceRect,
        viewport_width: u32,
        viewport_height: u32,
        source_width: u32,
        source_height: u32,
    ) -> Self {
        Self {
            x: rect.x.to_bits(),
            y: rect.y.to_bits(),
            width: rect.width.to_bits(),
            height: rect.height.to_bits(),
            viewport_width,
            viewport_height,
            source_width,
            source_height,
        }
    }
}

fn run_renderer(
    receiver: Receiver<Command>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    mut config: wgpu::SurfaceConfiguration,
    metrics: Arc<NativeCompositorMetrics>,
    controls: Arc<NativeControlMailboxes>,
) {
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("native video sampler"),
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("native video bind group layout"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            },
        ],
    });
    let effect_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("native effect uniform layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: NonZeroU64::new(std::mem::size_of::<EffectUniform>() as u64),
                },
                count: None,
            }],
        });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("native compositor shader"),
        source: wgpu::ShaderSource::Wgsl(
            r#"
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) texcoord: vec2<f32>,
}
@vertex fn vs_main(
  @location(0) position: vec2<f32>,
  @location(1) texcoord: vec2<f32>
) -> VertexOut {
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.texcoord = texcoord;
  return out;
}
@group(0) @binding(0) var video_texture: texture_2d<f32>;
@group(0) @binding(1) var video_sampler: sampler;
struct EffectUniform {
  clock: vec4<f32>,
  levels: vec4<f32>,
  params: vec4<f32>,
  transport: vec4<f32>,
  accent: vec4<f32>,
}
@group(1) @binding(0) var<uniform> u: EffectUniform;

fn sample_video(uv: vec2<f32>) -> vec3<f32> {
  return textureSample(video_texture, video_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
}

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let uv = in.texcoord;
  let dry = sample_video(uv);
  let mode = floor(u.levels.w + 0.5);
  let pulse = u.clock.w * exp(-fract(u.clock.x) * (5.0 + u.params.z * 12.0));
  let motion = u.clock.w * sin(u.clock.x * 6.2831853);
  var wet = dry;
  if (mode == 1.0) {
    let spread = 0.002 + u.params.x * 0.012 * (0.35 + pulse);
    wet.r = sample_video(uv + vec2<f32>(spread, 0.0)).r;
    wet.b = sample_video(uv - vec2<f32>(spread, 0.0)).b;
  } else if (mode == 2.0) {
    // The source-time curve is integrated by Rust. transport.z is the exact
    // beat-domain rate at this drawable, so the treatment follows the actual
    // ramp rather than a generic sine animation.
    let rate = max(u.transport.z, 0.001);
    let deviation = clamp(abs(log2(rate)) / 2.0, 0.0, 1.0);
    let trail = deviation * 0.035;
    wet = (sample_video(uv - vec2<f32>(trail, 0.0)) + dry * 3.0 + sample_video(uv + vec2<f32>(trail, 0.0))) / 5.0;
    let split = deviation * 0.012;
    wet.r = sample_video(uv + vec2<f32>(split, 0.0)).r;
    wet.b = sample_video(uv - vec2<f32>(split, 0.0)).b;
    if (rate < 1.0) {
      wet *= 1.0 + deviation * 0.15;
    } else {
      wet *= 1.0 - deviation * 0.05;
    }
  } else if (mode == 3.0) {
    let echo = vec2<f32>((0.008 + u.params.x * 0.035) * (0.5 + 0.5 * motion), 0.0);
    wet = max(dry, sample_video(uv + echo) * (0.35 + u.params.y * 0.55));
  } else if (mode == 4.0) {
    // Source slicing is performed by the authoritative native timeline. Do
    // not fabricate horizontal row offsets: they looked like corrupt frames
    // and were unrelated to the sampler's real FWD/REV/PONG/RND jumps.
    let rate = 0.25 + u.params.x * 1.75;
    let wobble = clamp(abs(rate - 1.0) - 0.05, 0.0, 1.0);
    let shifted = uv + vec2<f32>(sin(uv.y * 60.0 + u.clock.x * 9.0) * wobble * 0.004, 0.0);
    wet = sample_video(shifted);
    let hit = clamp(u.accent.w, 0.0, 1.0) * u.clock.w;
    if (u.transport.w < 0.5) {
      wet = min(pow(max(wet, vec3<f32>(0.0)), vec3<f32>(1.0 / (1.0 + hit * 0.18))) * (1.0 + hit * 0.22), vec3<f32>(1.0));
    } else if (u.transport.w < 1.5) {
      let split = hit * 0.012;
      wet.r = sample_video(shifted + vec2<f32>(split, 0.0)).r;
      wet.b = sample_video(shifted - vec2<f32>(split, 0.0)).b;
    }
  } else if (mode == 5.0) {
    wet = sample_video((uv - vec2<f32>(0.5)) / (1.0 + u.params.x * 0.13 * pulse) + vec2<f32>(0.5));
  } else if (mode == 6.0) {
    wet = sample_video(uv + vec2<f32>(sin(u.transport.y * 7.1), cos(u.transport.y * 5.3)) * (0.001 + u.params.x * 0.008));
  } else if (mode == 7.0) {
    let drift = vec2<f32>(sin(u.transport.y * (0.3 + u.params.x)), cos(u.transport.y * 0.37));
    wet = sample_video((uv - vec2<f32>(0.5)) / (1.02 + u.params.z * 0.08) + vec2<f32>(0.5) + drift * (0.002 + u.params.y * 0.012));
  } else if (mode == 8.0) {
    let radius = length(uv - vec2<f32>(0.5));
    let blur = (sample_video(uv + vec2<f32>(0.008, 0.0)) + sample_video(uv - vec2<f32>(0.008, 0.0)) + dry * 2.0) / 4.0;
    wet = mix(dry, blur, smoothstep(0.18, 0.55, radius));
  } else if (mode == 9.0) {
    wet = sample_video(vec2<f32>((uv.x - 0.5) * 0.88 + 0.5, uv.y));
  } else if (mode == 10.0) {
    let noiseUv = floor(uv * (240.0 + u.params.x * 900.0)) + vec2<f32>(floor(u.clock.x * 8.0));
    wet = dry + vec3<f32>((hash21(noiseUv) - 0.5) * u.params.y * 0.16);
  } else if (mode == 11.0) {
    let edge = pow(1.0 - uv.x, 2.0 + u.params.x * 5.0);
    wet = dry + u.accent.rgb * edge * (0.15 + u.params.y * 0.55) * (0.6 + 0.4 * pulse);
  } else if (mode == 12.0) {
    let p = uv - vec2<f32>(0.5);
    let c = 0.9928;
    let s = 0.1197;
    wet = sample_video(vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c) + vec2<f32>(0.5));
  } else if (mode == 13.0) {
    let halo = (sample_video(uv + vec2<f32>(0.010, 0.0)) + sample_video(uv - vec2<f32>(0.010, 0.0))) * 0.5;
    wet = dry + vec3<f32>(halo.r * 0.22, halo.g * 0.06, 0.0);
  } else if (mode == 14.0) {
    let p = uv - vec2<f32>(0.5);
    let r2 = dot(p, p);
    wet = sample_video(vec2<f32>(0.5) + p * (1.0 - r2 * u.params.x * 0.7));
  } else if (mode == 15.0) {
    let wobble = sin(uv.y * (60.0 + u.params.x * 90.0) + u.transport.y * 11.0) * (0.001 + u.params.z * 0.006);
    wet = sample_video(uv + vec2<f32>(wobble, 0.0));
    wet *= 0.92 + step(0.5, fract(uv.y * 240.0)) * 0.08;
  } else if (mode == 16.0) {
    wet = dry * (0.86 + step(0.5, fract(uv.y * 180.0)) * 0.14);
    wet.b *= 1.06;
  } else if (mode == 17.0) {
    wet.r = sample_video(uv + vec2<f32>(0.012, 0.004)).r;
    wet.b = sample_video(uv - vec2<f32>(0.012, 0.004)).b;
  } else if (mode == 18.0) {
    wet = (dry * 4.0 + sample_video(uv - vec2<f32>(0.018, 0.0)) * 2.0 + sample_video(uv - vec2<f32>(0.036, 0.0))) / 7.0;
  }
  let mixed = mix(dry, wet, clamp(u.levels.z, 0.0, 1.0));
  return vec4<f32>(clamp(mixed, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
"#
            .into(),
        ),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("native compositor pipeline layout"),
        bind_group_layouts: &[&bind_group_layout, &effect_bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("native compositor pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            compilation_options: Default::default(),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<Vertex>() as u64,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2],
            }],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: config.format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });
    let effect_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("native effect uniform buffer"),
        size: (MAX_NATIVE_SURFACES * EFFECT_UNIFORM_STRIDE) as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let effect_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("native effect uniform bind group"),
        layout: &effect_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &effect_uniform_buffer,
                offset: 0,
                size: NonZeroU64::new(std::mem::size_of::<EffectUniform>() as u64),
            }),
        }],
    });

    let test_bind_groups = make_test_bind_groups(&device, &queue, &bind_group_layout, &sampler);
    let mut rects = Vec::<NativeSurfaceRect>::new();
    let mut frames = HashMap::<String, ImportedFrame>::new();
    let mut imported_preview_textures = HashMap::<usize, Rc<ImportedTexture>>::new();
    let mut rect_geometry = HashMap::<String, (RectGeometryKey, wgpu::Buffer)>::new();
    let mut effect_uniform_bytes = vec![0_u8; MAX_NATIVE_SURFACES * EFFECT_UNIFORM_STRIDE];
    let mut program_source = None::<String>;
    let mut program_generation = 0_u64;
    let mut layout_generation = 0_u64;
    let mut layout_requested_frame = 0_u64;
    let mut test_pattern = false;
    let mut running = true;

    while running {
        // CAMetalLayer/vsync provides active-path back-pressure. Even a 1 ms
        // command wait consumes 12% of a 120 Hz ProMotion frame, so sample the
        // mailbox without delaying drawable acquisition. The non-renderable
        // path below sleeps explicitly to keep idle CPU bounded.
        match receiver.try_recv() {
            Ok(command) => apply_command(
                command,
                &mut running,
                &surface,
                &device,
                &mut config,
                &bind_group_layout,
                &sampler,
                &mut frames,
                &mut imported_preview_textures,
                &mut program_source,
                &mut test_pattern,
                &metrics,
            ),
            Err(mpsc::TryRecvError::Disconnected) => break,
            Err(mpsc::TryRecvError::Empty) => {}
        }
        while let Ok(command) = receiver.try_recv() {
            apply_command(
                command,
                &mut running,
                &surface,
                &device,
                &mut config,
                &bind_group_layout,
                &sampler,
                &mut frames,
                &mut imported_preview_textures,
                &mut program_source,
                &mut test_pattern,
                &metrics,
            );
        }
        apply_latest_program_source(
            &controls.program_source,
            &mut program_generation,
            &mut program_source,
            &mut frames,
            &metrics,
        );
        apply_latest_layout(
            &controls.layout,
            &mut layout_generation,
            &mut layout_requested_frame,
            &mut rects,
        );
        if !running || rects.is_empty() || (!test_pattern && frames.is_empty()) {
            thread::sleep(Duration::from_millis(4));
            continue;
        }
        let output = match surface.get_current_texture() {
            Ok(output) => output,
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                surface.configure(&device, &config);
                continue;
            }
            Err(wgpu::SurfaceError::Timeout) => continue,
            Err(wgpu::SurfaceError::Other) => continue,
            Err(wgpu::SurfaceError::OutOfMemory) => break,
        };
        let view = output.texture.create_view(&Default::default());
        // A cut can arrive while CAMetalLayer is waiting for the next drawable.
        // Re-read the latest-value mailbox here so the prepared frame is
        // promoted into the drawable we just acquired, not one refresh later.
        apply_latest_program_source(
            &controls.program_source,
            &mut program_generation,
            &mut program_source,
            &mut frames,
            &metrics,
        );
        apply_latest_layout(
            &controls.layout,
            &mut layout_generation,
            &mut layout_requested_frame,
            &mut rects,
        );
        let effect_anchor = controls
            .effect_transport
            .lock()
            .map(|anchor| *anchor)
            .unwrap_or_else(|_| (NativeEffectTransport::default(), Instant::now()));
        let mut visible_surface_count = 0_usize;
        for (index, rect) in rects
            .iter()
            .filter(|rect| rect.visible)
            .take(MAX_NATIVE_SURFACES)
            .enumerate()
        {
            let uniform = effect_uniform(rect, effect_anchor.0, effect_anchor.1);
            let start = index * EFFECT_UNIFORM_STRIDE;
            let bytes = bytemuck::bytes_of(&uniform);
            effect_uniform_bytes[start..start + bytes.len()].copy_from_slice(bytes);
            visible_surface_count = index + 1;
        }
        if visible_surface_count > 0 {
            queue.write_buffer(
                &effect_uniform_buffer,
                0,
                &effect_uniform_bytes[..visible_surface_count * EFFECT_UNIFORM_STRIDE],
            );
        }
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("native compositor frame"),
        });
        for rect in rects.iter().filter(|rect| rect.visible) {
            let imported = frames.get(&rect.surface_id);
            if imported.is_none() && !test_pattern {
                continue;
            }
            let (source_width, source_height) = imported
                .map(|frame| (frame.width, frame.height))
                .unwrap_or((16, 9));
            let key = RectGeometryKey::new(
                rect,
                config.width,
                config.height,
                source_width,
                source_height,
            );
            if rect_geometry
                .get(&rect.surface_id)
                .is_some_and(|(existing, _)| *existing == key)
            {
                continue;
            }
            let vertices = rect_vertices(
                rect,
                config.width,
                config.height,
                source_width,
                source_height,
            );
            let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("native surface rect"),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
            rect_geometry.insert(rect.surface_id.clone(), (key, vertex_buffer));
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("native compositor pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&pipeline);
            for (index, rect) in rects
                .iter()
                .filter(|rect| rect.visible)
                .take(MAX_NATIVE_SURFACES)
                .enumerate()
            {
                let imported = frames.get(&rect.surface_id);
                let bind_group = imported.map(|frame| &frame.texture.bind_group).or_else(|| {
                    test_pattern.then(|| &test_bind_groups[index % test_bind_groups.len()])
                });
                let Some(bind_group) = bind_group else {
                    continue;
                };
                let Some((_, vertex_buffer)) = rect_geometry.get(&rect.surface_id) else {
                    continue;
                };
                pass.set_bind_group(0, bind_group, &[]);
                pass.set_bind_group(
                    1,
                    &effect_bind_group,
                    &[(index * EFFECT_UNIFORM_STRIDE) as u32],
                );
                pass.set_vertex_buffer(0, vertex_buffer.slice(..));
                pass.draw(0..6, 0..1);
            }
        }
        queue.submit([encoder.finish()]);
        output.present();
        metrics.gpu_submissions.fetch_add(1, Ordering::Relaxed);
        metrics.presented_frames.fetch_add(1, Ordering::Relaxed);
        metrics.record_present(&frames, &rects, layout_requested_frame);
    }
    metrics.active.store(false, Ordering::Release);
}

#[allow(clippy::too_many_arguments)]
fn apply_command(
    command: Command,
    running: &mut bool,
    surface: &wgpu::Surface<'_>,
    device: &wgpu::Device,
    config: &mut wgpu::SurfaceConfiguration,
    bind_group_layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    frames: &mut HashMap<String, ImportedFrame>,
    imported_preview_textures: &mut HashMap<usize, Rc<ImportedTexture>>,
    program_source: &mut Option<String>,
    test_pattern: &mut bool,
    metrics: &NativeCompositorMetrics,
) {
    match command {
        Command::Resize(width, height) => {
            if config.width != width || config.height != height {
                config.width = width.max(1);
                config.height = height.max(1);
                surface.configure(device, config);
            }
        }
        Command::TestPattern(enabled) => *test_pattern = enabled,
        Command::Shutdown => *running = false,
        Command::Frames(next) => {
            for frame in next {
                let is_prepared = frame.module_id.starts_with(PREPARED_PROGRAM_FRAME_PREFIX);
                let is_program = frame.module_id.starts_with(PROGRAM_FRAME_PREFIX);
                let (surface_id, source_id) = if is_prepared {
                    let source_id =
                        frame.module_id[PREPARED_PROGRAM_FRAME_PREFIX.len()..].to_string();
                    (format!("{PREPARED_SURFACE_PREFIX}{source_id}"), source_id)
                } else if is_program {
                    (
                        "pgm".to_string(),
                        frame.module_id[PROGRAM_FRAME_PREFIX.len()..].to_string(),
                    )
                } else {
                    (frame.module_id.clone(), frame.module_id.clone())
                };
                if is_program && program_source.as_deref() != Some(source_id.as_str()) {
                    continue;
                }
                if is_prepared {
                    frames.retain(|surface_id, _| {
                        !surface_id.starts_with(PREPARED_SURFACE_PREFIX)
                            || surface_id == &format!("{PREPARED_SURFACE_PREFIX}{source_id}")
                    });
                }
                let width = frame.width;
                let height = frame.height;
                let timestamp_us = frame.timestamp_us;
                let sequence = frame.sequence;
                let iosurface_key = frame.iosurface_ptr() as usize;
                let cacheable_preview = !is_program && !is_prepared;
                let cached_texture = cacheable_preview
                    .then(|| imported_preview_textures.get(&iosurface_key).cloned())
                    .flatten();
                let imported_texture = if let Some(cached_texture) = cached_texture {
                    Some(cached_texture)
                } else {
                    match unsafe {
                        import_bgra_iosurface(device, frame.iosurface_ptr(), width, height)
                    } {
                        Ok(texture) => {
                            let view = texture.create_view(&Default::default());
                            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                                label: Some("native video frame bind group"),
                                layout: bind_group_layout,
                                entries: &[
                                    wgpu::BindGroupEntry {
                                        binding: 0,
                                        resource: wgpu::BindingResource::TextureView(&view),
                                    },
                                    wgpu::BindGroupEntry {
                                        binding: 1,
                                        resource: wgpu::BindingResource::Sampler(sampler),
                                    },
                                ],
                            });
                            let imported_texture = Rc::new(ImportedTexture {
                                _owner: frame,
                                _texture: texture,
                                bind_group,
                            });
                            metrics.iosurface_imports.fetch_add(1, Ordering::Relaxed);
                            if cacheable_preview {
                                if imported_preview_textures.len() >= MAX_IMPORTED_PREVIEW_TEXTURES
                                {
                                    imported_preview_textures.clear();
                                }
                                imported_preview_textures
                                    .insert(iosurface_key, Rc::clone(&imported_texture));
                            }
                            Some(imported_texture)
                        }
                        Err(_) => {
                            metrics
                                .iosurface_import_failures
                                .fetch_add(1, Ordering::Relaxed);
                            None
                        }
                    }
                };
                if let Some(texture) = imported_texture {
                    frames.insert(
                        surface_id,
                        ImportedFrame {
                            texture,
                            source_id,
                            width,
                            height,
                            timestamp_us,
                            sequence,
                        },
                    );
                    metrics.zero_copy_frames.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
    }
}

fn apply_latest_layout(
    mailbox: &Mutex<LayoutMailbox>,
    applied_generation: &mut u64,
    requested_frame: &mut u64,
    rects: &mut Vec<NativeSurfaceRect>,
) {
    let latest = mailbox.lock().ok().and_then(|mailbox| {
        (mailbox.generation != *applied_generation).then(|| {
            (
                mailbox.generation,
                mailbox.requested_frame,
                mailbox.rects.clone(),
            )
        })
    });
    if let Some((generation, latest_requested_frame, latest_rects)) = latest {
        *applied_generation = generation;
        *requested_frame = latest_requested_frame;
        *rects = latest_rects;
    }
}

fn apply_latest_program_source(
    mailbox: &Mutex<ProgramSourceMailbox>,
    applied_generation: &mut u64,
    program_source: &mut Option<String>,
    frames: &mut HashMap<String, ImportedFrame>,
    metrics: &NativeCompositorMetrics,
) {
    let latest = mailbox.lock().ok().and_then(|mailbox| {
        (mailbox.generation != *applied_generation).then(|| {
            (
                mailbox.generation,
                mailbox.source_id.clone(),
                mailbox.requested_at,
            )
        })
    });
    let Some((generation, source_id, requested_at)) = latest else {
        return;
    };
    *applied_generation = generation;
    *program_source = source_id.clone();
    if let Some(requested_at) = requested_at {
        metrics.request_program_source(source_id.clone(), requested_at);
    }
    let Some(source_id) = source_id else {
        frames.remove("pgm");
        return;
    };
    let prepared_id = format!("{PREPARED_SURFACE_PREFIX}{source_id}");
    if let Some(prepared) = frames.remove(&prepared_id) {
        frames.insert("pgm".into(), prepared);
    }
}

fn effect_uniform(
    rect: &NativeSurfaceRect,
    anchor: NativeEffectTransport,
    updated_at: Instant,
) -> EffectUniform {
    let elapsed = if anchor.playing {
        updated_at.elapsed().as_secs_f32()
    } else {
        0.0
    };
    let position = anchor.position_seconds + elapsed * anchor.playback_rate;
    let beat_delta = elapsed * anchor.playback_rate * anchor.bpm.max(1.0) / 60.0;
    let beat = anchor.beat_position + beat_delta;
    let beat_phase = if anchor.playing {
        beat.rem_euclid(1.0)
    } else {
        anchor.beat_phase
    };
    let normalize = |value: f32| (value / 100.0).clamp(0.0, 1.0);
    let speed_ramp_rate = if (rect.effect_mode - 2.0).abs() < 0.5 {
        SpeedRampProfile {
            length_percent: rect.p2 as f64,
            speed_min_percent: rect.p1 as f64,
            speed_max_percent: rect.p0 as f64,
            bezier_y0_percent: rect.p4 as f64,
            bezier_x1_percent: rect.p5 as f64,
            bezier_y1_percent: rect.p6 as f64,
            bezier_x2_percent: rect.p7 as f64,
            bezier_y2_percent: rect.p8 as f64,
            bezier_y3_percent: rect.p9 as f64,
            bypassed: false,
        }
        .rate_at_beat(beat as f64) as f32
    } else {
        anchor.playback_rate
    };
    let accent_age = position - anchor.time_sampler_accent_position_seconds;
    let time_sampler_hit = if anchor.playing
        && anchor.time_sampler_accent_mode < 1.5
        && accent_age >= 0.0
        && accent_age <= 0.5
    {
        (-accent_age * 12.0).exp()
    } else {
        0.0
    };
    EffectUniform {
        clock: [
            beat,
            beat_phase,
            anchor.bpm,
            if anchor.playing { 1.0 } else { 0.0 },
        ],
        levels: [
            anchor.amplitude.clamp(0.0, 2.0),
            anchor.bass_amp.clamp(0.0, 2.0),
            normalize(rect.mix),
            rect.effect_mode,
        ],
        params: [
            normalize(rect.p0),
            normalize(rect.p1),
            normalize(rect.p2),
            normalize(rect.p3),
        ],
        transport: [
            anchor.pitch_semitones,
            position,
            speed_ramp_rate,
            anchor.time_sampler_accent_mode.clamp(0.0, 2.0),
        ],
        accent: [
            rect.accent_r,
            rect.accent_g,
            rect.accent_b,
            time_sampler_hit,
        ],
    }
}

fn rect_vertices(
    rect: &NativeSurfaceRect,
    viewport_width: u32,
    viewport_height: u32,
    source_width: u32,
    source_height: u32,
) -> [Vertex; 6] {
    let left = rect.x / viewport_width as f32 * 2.0 - 1.0;
    let right = (rect.x + rect.width) / viewport_width as f32 * 2.0 - 1.0;
    let top = 1.0 - rect.y / viewport_height as f32 * 2.0;
    let bottom = 1.0 - (rect.y + rect.height) / viewport_height as f32 * 2.0;
    let (u0, v0, u1, v1) = cover_texcoords(
        rect.width,
        rect.height,
        source_width as f32,
        source_height as f32,
    );
    [
        Vertex {
            position: [left, top],
            texcoord: [u0, v0],
        },
        Vertex {
            position: [left, bottom],
            texcoord: [u0, v1],
        },
        Vertex {
            position: [right, bottom],
            texcoord: [u1, v1],
        },
        Vertex {
            position: [left, top],
            texcoord: [u0, v0],
        },
        Vertex {
            position: [right, bottom],
            texcoord: [u1, v1],
        },
        Vertex {
            position: [right, top],
            texcoord: [u1, v0],
        },
    ]
}

fn cover_texcoords(
    rect_width: f32,
    rect_height: f32,
    source_width: f32,
    source_height: f32,
) -> (f32, f32, f32, f32) {
    let rect_aspect = rect_width.max(1.0) / rect_height.max(1.0);
    let source_aspect = source_width.max(1.0) / source_height.max(1.0);
    if source_aspect > rect_aspect {
        let span = (rect_aspect / source_aspect).clamp(0.0, 1.0);
        let inset = (1.0 - span) * 0.5;
        (inset, 0.0, 1.0 - inset, 1.0)
    } else {
        let span = (source_aspect / rect_aspect).clamp(0.0, 1.0);
        let inset = (1.0 - span) * 0.5;
        (0.0, inset, 1.0, 1.0 - inset)
    }
}

fn make_test_bind_groups(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
) -> Vec<wgpu::BindGroup> {
    const COLORS: [[u8; 4]; 9] = [
        [34, 211, 238, 230],
        [52, 211, 153, 230],
        [250, 204, 21, 230],
        [251, 146, 60, 230],
        [244, 63, 94, 230],
        [232, 121, 249, 230],
        [167, 139, 250, 230],
        [96, 165, 250, 230],
        [45, 212, 191, 230],
    ];
    COLORS
        .iter()
        .enumerate()
        .map(|(index, color)| {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("native compositor test texture"),
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                color,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: None,
                    rows_per_image: None,
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
            let view = texture.create_view(&Default::default());
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some(&format!("native compositor test bind group {index}")),
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(sampler),
                    },
                ],
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{cover_texcoords, effect_uniform, NativeEffectTransport, NativeSurfaceRect};

    fn close(left: f32, right: f32) {
        assert!((left - right).abs() < 0.0001, "{left} != {right}");
    }

    fn effect_rect(effect_mode: f32) -> NativeSurfaceRect {
        NativeSurfaceRect {
            surface_id: "top-0".into(),
            effect_module_id: "test".into(),
            effect_mode,
            mix: 100.0,
            p0: 75.0,
            p1: 25.0,
            p2: 36.0,
            p3: 50.0,
            p4: 100.0,
            p5: 35.0,
            p6: 0.0,
            p7: 65.0,
            p8: 0.0,
            p9: 100.0,
            accent_r: 1.0,
            accent_g: 0.25,
            accent_b: 0.5,
            x: 0.0,
            y: 0.0,
            width: 320.0,
            height: 180.0,
            visible: true,
        }
    }

    #[test]
    fn matching_aspect_uses_the_full_texture() {
        let (u0, v0, u1, v1) = cover_texcoords(640.0, 360.0, 1920.0, 1080.0);
        close(u0, 0.0);
        close(v0, 0.0);
        close(u1, 1.0);
        close(v1, 1.0);
    }

    #[test]
    fn cover_crops_without_stretching_or_letterboxing() {
        let (u0, v0, u1, v1) = cover_texcoords(400.0, 300.0, 1920.0, 1080.0);
        assert!(u0 > 0.0 && u1 < 1.0);
        close(v0, 0.0);
        close(v1, 1.0);
    }

    #[test]
    fn effect_uniform_extrapolates_audio_clock_and_normalizes_controls() {
        let mut rect = effect_rect(5.0);
        rect.effect_module_id = "punch".into();
        rect.mix = 75.0;
        rect.p0 = 80.0;
        rect.p2 = 50.0;
        rect.p3 = 100.0;
        let anchor = NativeEffectTransport {
            position_seconds: 4.0,
            beat_position: 8.0,
            beat_phase: 0.0,
            bpm: 120.0,
            playback_rate: 1.0,
            playing: true,
            ..NativeEffectTransport::default()
        };
        let uniform = effect_uniform(&rect, anchor, Instant::now() - Duration::from_millis(250));
        assert!((uniform.clock[0] - 8.5).abs() < 0.03);
        assert!((uniform.clock[1] - 0.5).abs() < 0.03);
        close(uniform.levels[2], 0.75);
        close(uniform.levels[3], 5.0);
        close(uniform.params[0], 0.8);
        close(uniform.params[1], 0.25);
        assert!((uniform.transport[1] - 4.25).abs() < 0.03);
    }

    #[test]
    fn speed_ramp_uniform_uses_the_live_curve_rate() {
        let rect = effect_rect(2.0);
        let anchor = NativeEffectTransport {
            beat_position: 0.0,
            playback_rate: 1.0,
            playing: false,
            ..NativeEffectTransport::default()
        };
        let uniform = effect_uniform(&rect, anchor, Instant::now());
        close(uniform.transport[2], 2.0);
    }

    #[test]
    fn time_sampler_uniform_derives_hit_from_authoritative_event_time() {
        let rect = effect_rect(4.0);
        let anchor = NativeEffectTransport {
            position_seconds: 10.0,
            playing: true,
            time_sampler_accent_position_seconds: 9.9,
            time_sampler_accent_mode: 1.0,
            ..NativeEffectTransport::default()
        };
        let uniform = effect_uniform(&rect, anchor, Instant::now());
        assert!(uniform.accent[3] > 0.25 && uniform.accent[3] < 0.35);
        close(uniform.transport[3], 1.0);
    }
}
