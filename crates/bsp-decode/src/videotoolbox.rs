//! macOS VideoToolbox decode pipeline (Phase 2).
//!
//! v0 falls back to the shared synthetic frame path until HW decode is wired.

use crate::scheduler::synthetic_frame;
use crate::{DecodeError, DecodeFrame};

pub fn decode_frame(module_id: &str, path: &str, timestamp_us: i64) -> Result<Option<DecodeFrame>, DecodeError> {
    // TODO: replace with VideoToolbox + MP4 sample extraction on macOS.
    Ok(Some(synthetic_frame(module_id, path, timestamp_us)?))
}
