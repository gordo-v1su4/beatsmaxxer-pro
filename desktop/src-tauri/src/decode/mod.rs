use bsp_decode::DecodeFrame;
use tauri::Emitter;

pub fn emit_frame(app: &tauri::AppHandle, frame: &DecodeFrame) -> Result<(), String> {
    app.emit(
        "bsp://frame",
        serde_json::json!({
            "moduleId": frame.module_id,
            "width": frame.width,
            "height": frame.height,
            "timestampUs": frame.timestamp_us,
            "dataB64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &frame.rgba),
        }),
    )
    .map_err(|error| error.to_string())
}
