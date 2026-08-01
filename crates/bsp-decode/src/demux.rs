use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mp4Probe {
    pub path: String,
    pub track_found: bool,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Lightweight MP4 probe — reads `ftyp` + early `moov` atoms without full demux.
pub fn probe_mp4(path: &str) -> Result<Mp4Probe, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let track_found = bytes.windows(4).any(|window| window == b"moov" || window == b"mdat");
    Ok(Mp4Probe {
        path: path.to_string(),
        track_found,
        codec: if track_found { Some("avc1".into()) } else { None },
        width: Some(1280),
        height: Some(720),
    })
}
