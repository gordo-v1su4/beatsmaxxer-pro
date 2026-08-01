use bsp_decode::{backend_name, probe_mp4, DecodeFrame};

pub fn emit_frame(app: &tauri::AppHandle, frame: &DecodeFrame) -> Result<(), String> {
    app.emit(
        "bsp://frame",
        serde_json::json!({
            "moduleId": frame.module_id,
            "width": frame.width,
            "height": frame.height,
            "timestampUs": frame.timestamp_us,
            "data": frame.rgba,
        }),
    )
    .map_err(|error| error.to_string())
}

pub fn probe(path: &str) -> Result<bsp_decode::Mp4Probe, String> {
    probe_mp4(path)
}

pub fn backend() -> &'static str {
    backend_name()
}
