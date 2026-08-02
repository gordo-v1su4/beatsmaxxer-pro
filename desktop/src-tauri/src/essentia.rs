use std::time::Duration;

use reqwest::blocking::multipart;
use reqwest::blocking::Client;

#[tauri::command]
pub fn essentia_configured() -> bool {
    !std::env::var("ESSENTIA_API_BASE_URL")
        .unwrap_or_default()
        .trim()
        .is_empty()
        && !std::env::var("ESSENTIA_API_KEY")
            .unwrap_or_default()
            .trim()
            .is_empty()
}

#[tauri::command]
pub fn analyze_rhythm(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let base_url = std::env::var("ESSENTIA_API_BASE_URL")
        .map_err(|_| "ESSENTIA_API_BASE_URL is not set".to_string())?
        .trim()
        .trim_end_matches('/')
        .to_string();
    let api_key = std::env::var("ESSENTIA_API_KEY")
        .map_err(|_| "ESSENTIA_API_KEY is not set".to_string())?;

    if bytes.is_empty() {
        return Err("analysis upload is empty".into());
    }
    if bytes.len() > 3_500_000 {
        return Err("analysis upload exceeds size limit".into());
    }

    let part = multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str("audio/wav")
        .map_err(|error| error.to_string())?;
    let form = multipart::Form::new().part("file", part);

    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(format!("{base_url}/analyze/rhythm"))
        .header("X-API-Key", api_key)
        .multipart(form)
        .send()
        .map_err(|error| format!("Essentia request failed: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Essentia response read failed: {error}"))?;

    if !status.is_success() {
        return Err(format!("Essentia returned {status}: {body}"));
    }

    Ok(body)
}
