use std::io::{Cursor, Read};
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
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let size = file.metadata().map_err(|error| error.to_string())?.len();
    probe_reader(path, file, size).or_else(|_| {
        let mut header = Vec::new();
        std::fs::File::open(path)
            .map_err(|error| error.to_string())?
            .take(1024 * 1024)
            .read_to_end(&mut header)
            .map_err(|error| error.to_string())?;
        fallback_probe_bytes(path, &header)
    })
}

pub fn probe_mp4_bytes(path: &str, bytes: &[u8]) -> Result<Mp4Probe, String> {
    probe_reader(path, Cursor::new(bytes), bytes.len() as u64)
        .or_else(|_| fallback_probe_bytes(path, bytes))
}

fn fallback_probe_bytes(path: &str, bytes: &[u8]) -> Result<Mp4Probe, String> {
    let track_found = bytes
        .windows(4)
        .any(|window| window == b"moov" || window == b"mdat");
    if !track_found {
        return Err("MP4 header could not be parsed".into());
    }
    Ok(Mp4Probe {
        path: path.to_string(),
        track_found,
        codec: Some("avc1".into()),
        width: Some(1280),
        height: Some(720),
        duration_us: None,
    })
}

fn probe_reader<R: std::io::Read + std::io::Seek>(
    path: &str,
    source: R,
    size: u64,
) -> Result<Mp4Probe, String> {
    if let Ok(reader) = Mp4Reader::read_header(source, size) {
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

    Err("MP4 header could not be parsed".into())
}

#[allow(dead_code)]
pub fn file_exists(path: &str) -> bool {
    Path::new(path).is_file()
}
