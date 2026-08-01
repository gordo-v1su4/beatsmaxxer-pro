use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodeFrame {
    pub module_id: String,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: i64,
    pub rgba: Vec<u8>,
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
