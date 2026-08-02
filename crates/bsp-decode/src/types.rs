use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use objc2_core_foundation::CFRetained;
#[cfg(target_os = "macos")]
use objc2_core_video::CVImageBuffer;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodeFrame {
    pub module_id: String,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: i64,
    pub sequence: u64,
    pub bgra: Vec<u8>,
}

/// A decoded frame whose pixels remain owned by the native decoder.
///
/// This type deliberately does not implement `Serialize`: a native frame is a
/// process-local GPU resource, not an IPC payload. The current BSPF bridge can
/// explicitly call `into_cpu_frame` while it is being retired, but the native
/// compositor consumes the retained Core Video buffer directly.
pub struct NativeDecodeFrame {
    pub module_id: String,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: i64,
    pub sequence: u64,
    #[cfg(target_os = "macos")]
    pub(crate) pixel_buffer: CFRetained<CVImageBuffer>,
    #[cfg(not(target_os = "macos"))]
    pub(crate) bgra: Vec<u8>,
}

impl std::fmt::Debug for NativeDecodeFrame {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NativeDecodeFrame")
            .field("module_id", &self.module_id)
            .field("width", &self.width)
            .field("height", &self.height)
            .field("timestamp_us", &self.timestamp_us)
            .field("sequence", &self.sequence)
            .field("storage", &"native")
            .finish()
    }
}

// Core Video objects are thread-safe to retain and release. Each frame is
// otherwise consumed by exactly one decode/compositor worker; the pixel buffer
// is never mutated by Beat Surfer.
unsafe impl Send for NativeDecodeFrame {}

#[cfg(not(target_os = "macos"))]
impl NativeDecodeFrame {
    pub(crate) fn from_cpu(frame: DecodeFrame) -> Self {
        Self {
            module_id: frame.module_id,
            width: frame.width,
            height: frame.height,
            timestamp_us: frame.timestamp_us,
            sequence: frame.sequence,
            bgra: frame.bgra,
        }
    }

    #[cfg(feature = "cpu-frame-bridge")]
    pub fn into_cpu_frame(self) -> Result<DecodeFrame, DecodeError> {
        Ok(DecodeFrame {
            module_id: self.module_id,
            width: self.width,
            height: self.height,
            timestamp_us: self.timestamp_us,
            sequence: self.sequence,
            bgra: self.bgra,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("unsupported platform")]
    UnsupportedPlatform,
    #[error("demux failed: {0}")]
    Demux(String),
    #[error("decode failed: {0}")]
    Decode(String),
}
