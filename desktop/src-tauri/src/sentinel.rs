use std::net::UdpSocket;
use std::sync::Mutex;

#[derive(Default)]
pub struct SentinelSender(Mutex<Option<UdpSocket>>);

fn frame_packet(values: &[f32]) -> Result<Vec<u8>, String> {
    if values.len() != 24 || values.iter().any(|v| !v.is_finite()) {
        return Err("Invalid Sentinel frame".into());
    }
    // Sentinel's Script OSC binding exposes one scalar per message. Bundle all
    // fields into one datagram and commit last, so the receiver sees one frame.
    let mut bytes = b"#bundle\0\0\0\0\0\0\0\0\x01".to_vec();
    for (index,value) in values.iter().enumerate() {
        append_scalar(&mut bytes,&format!("/bmx/v/{index}"),*value);
    }
    append_scalar(&mut bytes,"/bmx/commit",values[1]);
    Ok(bytes)
}
fn append_scalar(bundle:&mut Vec<u8>, address:&str,value:f32) {
    let mut message=address.as_bytes().to_vec();
    message.push(0); while message.len()%4!=0 {message.push(0);}
    message.extend_from_slice(b",f\0\0"); message.extend_from_slice(&value.to_be_bytes());
    bundle.extend_from_slice(&(message.len() as u32).to_be_bytes());bundle.extend(message);
}

/// Local-only OSC output. No machine settings or network exposure are required.
#[tauri::command]
pub fn sentinel_send(state: tauri::State<'_, SentinelSender>, values: Vec<f32>) -> Result<(), String> {
    let bytes=frame_packet(&values)?;
    let mut guard=state.0.lock().map_err(|_| "Sentinel sender is unavailable")?;
    if guard.is_none() {
        let socket=UdpSocket::bind("127.0.0.1:0").map_err(|e|e.to_string())?;
        socket.connect("127.0.0.1:9017").map_err(|e|e.to_string())?;
        *guard=Some(socket);
    }
    guard.as_ref().unwrap().send(&bytes).map(|_|()).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn osc_frame_has_aligned_address_tags_and_big_endian_values() {
        let mut values=vec![0.0;24]; values[4]=131.0;
        let packet=frame_packet(&values).unwrap();
        assert_eq!(&packet[..8], b"#bundle\0");
        assert_eq!(&packet[16..20], &20_u32.to_be_bytes());
        assert_eq!(&packet[132..136], &131.0_f32.to_be_bytes());
        assert_eq!(packet.len(),616);
        assert!(frame_packet(&[0.0;20]).is_err());
        values[0]=f32::NAN; assert!(frame_packet(&values).is_err());
    }
}
