mod demux;
#[cfg(target_os = "macos")]
mod macos_surface;
mod scheduler;
mod types;

#[cfg(target_os = "macos")]
pub mod videotoolbox;

pub use demux::{probe_mp4, Mp4Probe};
pub use scheduler::{
    DecodeScheduler, PREPARED_PROGRAM_FRAME_PREFIX, PROGRAM_FRAME_PREFIX,
};
pub use types::{DecodeError, DecodeFrame, NativeDecodeFrame};

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
    #[cfg(not(target_os = "macos"))]
    fn synthetic_frame_has_expected_dimensions_off_macos() {
        let dir = std::env::temp_dir().join("bsp-decode-synth");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("clip.mp4");
        std::fs::write(&path, b"....ftypisom....moov....").unwrap();
        let frame =
            scheduler::synthetic_frame("mod-0", path.to_str().unwrap(), 1_000_000, 1).unwrap();
        assert_eq!(frame.module_id, "mod-0");
        assert_eq!(frame.width, 1280);
        assert_eq!(frame.height, 720);
        assert_eq!(frame.bgra.len(), 1280 * 720 * 4);
    }
}
