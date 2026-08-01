use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::demux::probe_mp4;
use crate::types::{DecodeError, DecodeFrame};
use crate::decode_tick;

/// Shared decode scheduler — mirrors VideoPool lane registration on the Rust side.
pub struct DecodeScheduler {
    clips: HashMap<String, String>,
    running: bool,
    tick: u64,
}

impl Default for DecodeScheduler {
    fn default() -> Self {
        Self {
            clips: HashMap::new(),
            running: false,
            tick: 0,
        }
    }
}

impl DecodeScheduler {
    pub fn open_clip(&mut self, module_id: String, path: String) -> Result<(), DecodeError> {
        probe_mp4(&path).map_err(DecodeError::Demux)?;
        self.clips.insert(module_id, path);
        Ok(())
    }

    pub fn release_clip(&mut self, module_id: &str) {
        self.clips.remove(module_id);
    }

    pub fn stop(&mut self) {
        self.clips.clear();
        self.running = false;
        self.tick = 0;
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

    /// Advance one scheduler tick and emit frames for every registered lane.
    pub fn tick_frames(&mut self) -> Result<Vec<DecodeFrame>, DecodeError> {
        if !self.running || self.clips.is_empty() {
            return Ok(Vec::new());
        }
        self.tick = self.tick.wrapping_add(1);
        let timestamp_us = self.timestamp_us();
        let mut frames = Vec::with_capacity(self.clips.len());
        for (module_id, path) in self.clips.clone() {
            if let Some(frame) = decode_tick(&module_id, &path, timestamp_us)? {
                frames.push(frame);
            }
        }
        Ok(frames)
    }

    fn timestamp_us(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_micros() as i64)
            .unwrap_or(self.tick as i64 * 16_667)
    }
}

/// Cross-platform synthetic RGBA frame for IPC + WebGPU upload testing.
pub fn synthetic_frame(module_id: &str, path: &str, timestamp_us: i64) -> Result<DecodeFrame, DecodeError> {
    let probe = probe_mp4(path).map_err(DecodeError::Demux)?;
    let width = probe.width.unwrap_or(1280);
    let height = probe.height.unwrap_or(720);
    let mut rgba = vec![0u8; (width * height * 4) as usize];
    let phase = ((timestamp_us / 16_667).max(0) as u32).wrapping_add(module_id.len() as u32);
    for y in 0..height {
        for x in 0..width {
            let index = ((y * width + x) * 4) as usize;
            rgba[index] = ((x + phase) % 256) as u8;
            rgba[index + 1] = ((y + phase / 3) % 256) as u8;
            rgba[index + 2] = ((phase / 7) % 256) as u8;
            rgba[index + 3] = 255;
        }
    }
    Ok(DecodeFrame {
        module_id: module_id.to_string(),
        width,
        height,
        timestamp_us,
        rgba,
    })
}
