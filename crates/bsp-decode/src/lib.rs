mod demux;
mod scheduler;
mod types;

#[cfg(target_os = "macos")]
pub mod videotoolbox;

pub use demux::{probe_mp4, Mp4Probe};
pub use scheduler::DecodeScheduler;
pub use types::{DecodeError, DecodeFrame};

/// Runtime decode backend label for diagnostics.
pub fn backend_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "videotoolbox"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "stub"
    }
}

/// Single decode tick for one module — delegates to platform backend.
pub fn decode_tick(module_id: &str, path: &str, timestamp_us: i64) -> Result<Option<DecodeFrame>, DecodeError> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(frame) = videotoolbox::decode_frame(module_id, path, timestamp_us) {
            return Ok(frame);
        }
    }
    Ok(Some(scheduler::synthetic_frame(module_id, path, timestamp_us)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probes_small_mp4_bytes() {
        let dir = std::env::temp_dir().join("bsp-decode-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("sample.mp4");
        std::fs::write(&path, b"....ftypisom....moov....").unwrap();
        let probe = probe_mp4(path.to_str().unwrap()).unwrap();
        assert!(probe.track_found);
    }

    #[test]
    fn reports_stub_backend_off_macos() {
        #[cfg(not(target_os = "macos"))]
        assert_eq!(backend_name(), "stub");
    }

    #[test]
    fn synthetic_frame_has_expected_dimensions() {
        let dir = std::env::temp_dir().join("bsp-decode-synth");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("clip.mp4");
        std::fs::write(&path, b"....ftypisom....moov....").unwrap();
        let frame = decode_tick("mod-0", path.to_str().unwrap(), 1_000_000)
            .unwrap()
            .expect("frame");
        assert_eq!(frame.module_id, "mod-0");
        assert_eq!(frame.width, 1280);
        assert_eq!(frame.height, 720);
        assert_eq!(frame.rgba.len(), 1280 * 720 * 4);
    }
}
