use bsp_decode::DecodeFrame;

const PACKET_MAGIC: &[u8; 4] = b"BSPF";
const PACKET_VERSION: u16 = 1;

/// Pack all newest lane frames into one raw Tauri response. This avoids JSON,
/// base64, and eight separate IPC calls per presentation turn.
pub fn encode_frame_batch(frames: &[DecodeFrame]) -> Vec<u8> {
    if frames.is_empty() {
        return Vec::new();
    }
    let payload_size = frames.iter().fold(8usize, |size, frame| {
        size + 2 + 4 + 4 + 8 + 8 + 4 + frame.module_id.len() + frame.bgra.len()
    });
    let mut bytes = Vec::with_capacity(payload_size);
    bytes.extend_from_slice(PACKET_MAGIC);
    bytes.extend_from_slice(&PACKET_VERSION.to_le_bytes());
    bytes.extend_from_slice(&(frames.len() as u16).to_le_bytes());
    for frame in frames {
        let id = frame.module_id.as_bytes();
        bytes.extend_from_slice(&(id.len() as u16).to_le_bytes());
        bytes.extend_from_slice(&frame.width.to_le_bytes());
        bytes.extend_from_slice(&frame.height.to_le_bytes());
        bytes.extend_from_slice(&frame.timestamp_us.to_le_bytes());
        bytes.extend_from_slice(&frame.sequence.to_le_bytes());
        bytes.extend_from_slice(&(frame.bgra.len() as u32).to_le_bytes());
        bytes.extend_from_slice(id);
        bytes.extend_from_slice(&frame.bgra);
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_batch_has_stable_binary_header() {
        let packet = encode_frame_batch(&[DecodeFrame {
            module_id: "top-0".into(),
            width: 2,
            height: 2,
            timestamp_us: 42,
            sequence: 7,
            bgra: vec![1; 16],
        }]);
        assert_eq!(&packet[..4], b"BSPF");
        assert_eq!(u16::from_le_bytes([packet[4], packet[5]]), 1);
        assert_eq!(u16::from_le_bytes([packet[6], packet[7]]), 1);
    }
}
