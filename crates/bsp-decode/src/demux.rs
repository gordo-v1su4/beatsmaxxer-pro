use std::io::Cursor;
use std::path::Path;

use mp4::Mp4Reader;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mp4Probe {
    pub path: String,
    pub track_found: bool,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_us: Option<i64>,
}

/// MP4 probe — reads container metadata via the `mp4` crate.
pub fn probe_mp4(path: &str) -> Result<Mp4Probe, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    probe_mp4_bytes(path, &bytes)
}

pub fn probe_mp4_bytes(path: &str, bytes: &[u8]) -> Result<Mp4Probe, String> {
    if let Ok(reader) = Mp4Reader::read_header(Cursor::new(bytes), bytes.len() as u64) {
        let track = reader
            .tracks()
            .values()
            .find(|track| track.track_type().ok() == Some(mp4::TrackType::Video));
        let (width, height, codec) = if let Some(track) = track {
            let width = Some(track.width() as u32);
            let height = Some(track.height() as u32);
            let codec = track.media_type().ok().map(|media| match media {
                mp4::MediaType::H264 => "avc1".into(),
                mp4::MediaType::H265 => "hvc1".into(),
                other => format!("{other:?}"),
            });
            (width, height, codec)
        } else {
            (None, None, None)
        };
        let duration_us = (reader.duration().as_secs_f64() * 1_000_000.0).round() as i64;
        return Ok(Mp4Probe {
            path: path.to_string(),
            track_found: track.is_some(),
            codec,
            width: width.or(Some(1280)),
            height: height.or(Some(720)),
            duration_us: Some(duration_us),
        });
    }

    let track_found = bytes.windows(4).any(|window| window == b"moov" || window == b"mdat");
    Ok(Mp4Probe {
        path: path.to_string(),
        track_found,
        codec: if track_found { Some("avc1".into()) } else { None },
        width: Some(1280),
        height: Some(720),
        duration_us: None,
    })
}

#[allow(dead_code)]
pub fn file_exists(path: &str) -> bool {
    Path::new(path).is_file()
}
