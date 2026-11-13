use std::{io::Read, sync::OnceLock, time::Duration};

use reqwest::blocking::multipart;
use reqwest::blocking::Client;
use reqwest::blocking::Response;
use reqwest::redirect::Policy;
use serde::Serialize;

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

#[derive(Serialize)]
pub struct AnalysisResponse {
    status: u16,
    body: String,
}

fn connection() -> Result<(Client, String, String), String> {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    let base_url = std::env::var("ESSENTIA_API_BASE_URL")
        .map_err(|_| "ESSENTIA_API_BASE_URL is not set".to_string())?
        .trim()
        .trim_end_matches('/')
        .to_string();
    let api_key =
        std::env::var("ESSENTIA_API_KEY").map_err(|_| "ESSENTIA_API_KEY is not set".to_string())?;

    if CLIENT.get().is_none() {
        let client = Client::builder()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| "Could not start desktop Studio connection")?;
        let _ = CLIENT.set(client);
    }
    let client = CLIENT.get().ok_or("Desktop Studio connection unavailable")?.clone();
    if base_url.is_empty() || api_key.trim().is_empty() {
        return Err("Desktop Essentia configuration is empty".into());
    }
    Ok((client, base_url, api_key))
}

fn connection_error(stage: &str, error: reqwest::Error) -> String {
    let reason = if error.is_timeout() { "timed out" }
        else if error.is_connect() { "could not connect" }
        else { "connection interrupted" };
    format!("Studio {stage} {reason}. Check the connection and retry.")
}

fn read_response(response: Response) -> Result<AnalysisResponse, String> {
    const MAX_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    response.take(MAX_RESPONSE_BYTES + 1).read_to_end(&mut bytes)
        .map_err(|_| "Studio response was interrupted")?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("Studio response exceeds size limit".into());
    }
    let body = String::from_utf8(bytes).map_err(|_| "Invalid Studio response encoding")?;
    Ok(AnalysisResponse { status, body })
}

fn valid_job_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128
        && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

#[tauri::command]
pub async fn submit_studio_analysis(
    request: tauri::ipc::Request<'_>,
) -> Result<AnalysisResponse, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= 256 * 1024 * 1024 => bytes.clone(),
        _ => return Err("Studio audio upload is empty or exceeds the 256 MiB limit".into()),
    };
    let format = request.headers().get("x-analysis-format").and_then(|value| value.to_str().ok()).unwrap_or_default();
    let mime = match format {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => return Err("Desktop Studio accepts WAV or MP3 audio".into()),
    };
    let file_name = format!("song.{format}");
    let idempotency_key = request.headers().get("x-idempotency-key")
        .and_then(|value| value.to_str().ok()).unwrap_or_default().to_owned();
    if !valid_job_id(&idempotency_key) {
        return Err("Invalid Studio request id".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (client, base, key) = connection()?;
        let part = multipart::Part::bytes(bytes).file_name(file_name)
            .mime_str(mime).map_err(|_| "Invalid Studio upload type")?;
        let response = client.post(format!("{base}/analyze/studio/jobs"))
            .timeout(Duration::from_secs(120))
            .header("X-API-Key", key).header("Idempotency-Key", idempotency_key)
            .multipart(multipart::Form::new().part("file", part)).send()
            .map_err(|error| connection_error("submission", error))?;
        read_response(response)
    }).await.map_err(|_| "Desktop Studio submission interrupted")?
}

#[tauri::command]
pub async fn poll_studio_analysis(job_id: String) -> Result<AnalysisResponse, String> {
    if !valid_job_id(&job_id) {
        return Err("Invalid Studio job id".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (client, base, key) = connection()?;
        let response = client.get(format!("{base}/analyze/studio/jobs/{job_id}"))
            .timeout(Duration::from_secs(60))
            .header("X-API-Key", key).send()
            .map_err(|error| connection_error("polling", error))?;
        read_response(response)
    }).await.map_err(|_| "Desktop Studio polling interrupted")?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restrict_polling_to_one_job() {
        assert!(valid_job_id("job-123_abc"));
        assert!(valid_job_id(&"a".repeat(128)));
        for id in ["", "../health", "job/other", "job?key=x", "job#fragment", "%2e%2e"] {
            assert!(!valid_job_id(id));
        }
        assert!(!valid_job_id(&"a".repeat(129)));
    }
}
