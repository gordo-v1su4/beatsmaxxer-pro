//! Narrow bridge to the configured application API. Never exposes session cookies to JS.
use reqwest::{blocking::Client, redirect::Policy, Url};
use serde::Serialize;
use std::{
    io::Read,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Default, Clone)]
pub struct HostedApiSession(Arc<Mutex<String>>);

#[derive(Serialize)]
pub struct ApiResponse {
    status: u16,
    body: String,
}

fn application_origin(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "Desktop media service URL is invalid")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Desktop media service must be an HTTPS application origin".into());
    }
    Ok(url)
}

fn configured_origin() -> Result<Url, String> {
    let configured = std::env::var("BMX_API_BASE_URL").unwrap_or_default();
    if configured.trim().is_empty() {
        return Err("Set BMX_API_BASE_URL in the desktop configuration .env and restart to use hosted media.".into());
    }
    application_origin(&configured)
}

fn permitted_demo_path(path: &str) -> bool {
    if path == "/demo-media/manifest.json" {
        return true;
    }
    let Some(file) = path.strip_prefix("/demo-media/") else {
        return false;
    };
    let Some((hash, extension)) = file.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && matches!(extension, "mp4" | "mp3" | "json")
}

#[tauri::command]
pub async fn hosted_demo_request(path: String) -> Result<tauri::ipc::Response, String> {
    if !permitted_demo_path(&path) {
        return Err("Unsupported desktop demo asset".into());
    }
    let origin = configured_origin()?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|_| "Could not start desktop demo connection")?;
        let response = client
            .get(origin.join(&path).map_err(|_| "Invalid demo route")?)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|_| {
                "Demo files are unavailable. Check the desktop media configuration and retry."
            })?;
        let limit = 64 * 1024 * 1024;
        let mut bytes = Vec::new();
        response
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Desktop demo download interrupted")?;
        if bytes.len() as u64 > limit {
            return Err("Desktop demo asset exceeds size limit".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|_| "Desktop demo download interrupted")?
}

fn permitted_route(method: &str, path: &str) -> bool {
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    if route == "/__api/gate" {
        return query.is_empty() && matches!(method, "GET" | "POST");
    }
    if route == "/__api/media/upload" {
        return method == "POST";
    }
    if !query.is_empty() {
        return false;
    }
    if route == "/__api/media/jobs" {
        return method == "POST";
    }
    let rest = route.strip_prefix("/__api/media/jobs/").or_else(|| {
        if method == "GET" {
            route.strip_prefix("/__api/media/demo/jobs/")
        } else {
            None
        }
    });
    let Some(rest) = rest else {
        return false;
    };
    let (id, retry) = rest
        .strip_suffix("/retry")
        .map(|id| (id, true))
        .unwrap_or((rest, false));
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && if retry {
            method == "POST"
        } else {
            method == "GET"
        }
}

impl HostedApiSession {
    fn request(
        &self,
        origin: Url,
        path: String,
        method: String,
        content_type: Option<String>,
        body: Vec<u8>,
    ) -> Result<ApiResponse, String> {
        if !permitted_route(&method, &path) || body.len() > 4 * 1024 * 1024 {
            return Err("Unsupported desktop media request".into());
        }
        let url = origin
            .join(&path)
            .map_err(|_| "Invalid desktop media route")?;
        if url.origin() != origin.origin() {
            return Err("Invalid desktop media origin".into());
        }
        let timeout = if path.starts_with("/__api/media/upload?") {
            120
        } else {
            30
        };
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(timeout))
            .build()
            .map_err(|_| "Could not start desktop media connection")?;
        let cookie = self
            .0
            .lock()
            .map_err(|_| "Desktop media session unavailable")?
            .clone();
        let mut request = client
            .request(method.parse().map_err(|_| "Invalid media method")?, url)
            .header("Origin", origin.origin().ascii_serialization());
        if !cookie.is_empty() {
            request = request.header("Cookie", cookie);
        }
        if let Some(content_type) = content_type {
            request = request.header("Content-Type", content_type);
        }
        let response = request.body(body).send().map_err(|_| {
            "Desktop media service is unavailable. Check its configuration and retry."
        })?;
        let status = response.status().as_u16();
        if path == "/__api/gate" && method == "POST" && response.status().is_success() {
            if let Some(cookie) = response
                .headers()
                .get_all("set-cookie")
                .iter()
                .filter_map(|value| value.to_str().ok())
                .find_map(|value| {
                    let cookie = value.split(';').next()?.trim();
                    cookie.starts_with("bmx_access=").then(|| cookie.to_owned())
                })
            {
                *self
                    .0
                    .lock()
                    .map_err(|_| "Desktop media session unavailable")? = cookie;
            }
        }
        let mut bytes = Vec::new();
        response
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Desktop media response interrupted")?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("Desktop media response exceeds size limit".into());
        }
        let body = String::from_utf8(bytes).map_err(|_| "Invalid desktop media response")?;
        Ok(ApiResponse { status, body })
    }
}

#[tauri::command]
pub async fn hosted_api_request(
    session: tauri::State<'_, HostedApiSession>,
    path: String,
    method: String,
    content_type: Option<String>,
    body: Vec<u8>,
) -> Result<ApiResponse, String> {
    let origin = configured_origin()?;
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        session.request(origin, path, method, content_type, body)
    })
    .await
    .map_err(|_| "Desktop media request interrupted")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restricts_origins_and_routes() {
        assert!(permitted_demo_path("/demo-media/manifest.json"));
        assert!(permitted_demo_path(&format!(
            "/demo-media/{}.mp4",
            "a".repeat(64)
        )));
        for path in [
            "/demo-media/../private.env",
            "/demo-media/manifest.json?x=1",
            "https://evil.example/file.mp4",
        ] {
            assert!(!permitted_demo_path(path));
        }
        for url in ["https://app.example", "http://127.0.0.1:5174"] {
            assert!(application_origin(url).is_ok());
        }
        for url in [
            "http://app.example",
            "https://user:secret@app.example",
            "https://app.example/path",
            "https://app.example?key=x",
        ] {
            assert!(application_origin(url).is_err());
        }
        let id = "a".repeat(64);
        assert!(permitted_route("GET", &format!("/__api/media/jobs/{id}")));
        assert!(permitted_route(
            "POST",
            &format!("/__api/media/jobs/{id}/retry")
        ));
        for path in [
            "//evil.example",
            "/__api/media/jobs/../gate",
            "/__api/media/jobs/%2e%2e",
            "/__api/media/demo/jobs/unknown",
            "/__api/analyze",
        ] {
            assert!(!permitted_route("GET", path));
        }
        assert!(!permitted_route(
            "POST",
            &format!("/__api/media/demo/jobs/{id}/retry")
        ));
    }

    #[test]
    fn forwards_origin_and_retains_session_without_exposing_cookie() {
        use std::{io::Write, net::TcpListener, thread};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let expected_origin = origin.clone();
        let server = thread::spawn(move || {
            for index in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut header = Vec::new();
                loop {
                    let mut byte = [0];
                    stream.read_exact(&mut byte).unwrap();
                    header.push(byte[0]);
                    if header.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                let header = String::from_utf8(header).unwrap().to_lowercase();
                assert!(header.contains(&format!("origin: {expected_origin}")));
                if index > 0 {
                    assert!(header.contains("cookie: bmx_access=test-session"));
                }
                let status = if index == 2 {
                    "503 Service Unavailable"
                } else {
                    "200 OK"
                };
                let cookie = if index == 0 {
                    "Set-Cookie: bmx_access=test-session; HttpOnly; SameSite=Strict\r\n"
                } else {
                    ""
                };
                write!(stream,"HTTP/1.1 {status}\r\nContent-Length: 2\r\n{cookie}Connection: close\r\n\r\n{{}}").unwrap();
            }
        });
        let session = HostedApiSession::default();
        let first = session
            .request(
                application_origin(&origin).unwrap(),
                "/__api/gate".into(),
                "POST".into(),
                None,
                vec![],
            )
            .unwrap();
        assert_eq!(
            serde_json::to_string(&first).unwrap(),
            r#"{"status":200,"body":"{}"}"#
        );
        let path = format!("/__api/media/jobs/{}", "a".repeat(64));
        assert_eq!(
            session
                .request(
                    application_origin(&origin).unwrap(),
                    path.clone(),
                    "GET".into(),
                    None,
                    vec![]
                )
                .unwrap()
                .status,
            200
        );
        assert_eq!(
            session
                .request(
                    application_origin(&origin).unwrap(),
                    path,
                    "GET".into(),
                    None,
                    vec![]
                )
                .unwrap()
                .status,
            503
        );
        server.join().unwrap();
    }

    /// Opt-in integration against the operator's service; no credentials in test output.
    #[test]
    #[ignore = "requires configured live media service and a small 24 FPS fixture"]
    fn live_upload_prepare_and_reuse() {
        let origin = application_origin(&std::env::var("BMX_LIVE_ORIGIN").unwrap()).unwrap();
        let id = std::env::var("BMX_TEST_JOB_ID").unwrap();
        let path = format!("/__api/media/jobs/{id}");
        let session = HostedApiSession::default();
        let request = |method: &str, path: &str, body: Vec<u8>, content_type: &str| {
            session
                .request(
                    origin.clone(),
                    path.into(),
                    method.into(),
                    Some(content_type.into()),
                    body,
                )
                .unwrap()
        };
        assert_eq!(
            request("GET", &path, vec![], "application/json").status,
            401
        );
        let pin = std::env::var("BMX_TEST_PIN").unwrap();
        let unlock = serde_json::to_vec(&serde_json::json!({"pin":pin})).unwrap();
        assert_eq!(
            request("POST", "/__api/gate", unlock, "application/json").status,
            200
        );
        let existing = request("GET", &path, vec![], "application/json");
        if existing.status == 404 {
            let source = std::fs::read(std::env::var("BMX_TEST_MEDIA_FILE").unwrap()).unwrap();
            let upload_id = std::env::var("BMX_TEST_UPLOAD_ID").unwrap();
            let chunks: Vec<_> = source.chunks(3 * 1024 * 1024).collect();
            for (index, chunk) in chunks.iter().enumerate() {
                let mut multipart=format!("--bmx-live-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{index:05}.part\"\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();
                multipart.extend_from_slice(chunk);
                multipart.extend(b"\r\n--bmx-live-boundary--\r\n");
                assert_eq!(
                    request(
                        "POST",
                        &format!("/__api/media/upload?uploadId={upload_id}&chunkIndex={index}"),
                        multipart,
                        "multipart/form-data; boundary=bmx-live-boundary"
                    )
                    .status,
                    200
                );
            }
            let body=serde_json::to_vec(&serde_json::json!({"sha256":std::env::var("BMX_TEST_SOURCE_SHA").unwrap(),"name":"desktop-24fps.mp4","size":source.len(),"uploadId":upload_id,"chunkCount":chunks.len()})).unwrap();
            assert!(matches!(
                request("POST", "/__api/media/jobs", body, "application/json").status,
                200 | 202
            ));
        } else {
            assert_eq!(existing.status, 200);
        }
        let mut ready = None;
        for _ in 0..180 {
            let response = request("GET", &path, vec![], "application/json");
            assert_eq!(response.status, 200);
            let job: serde_json::Value = serde_json::from_str(&response.body).unwrap();
            assert_eq!(job["id"], id);
            if job["state"] == "ready" {
                ready = Some(job);
                break;
            }
            assert_ne!(job["state"], "failed", "live worker reported failure");
            std::thread::sleep(Duration::from_secs(1));
        }
        let job = ready.expect("live preparation timed out");
        assert!(job["artifact"]["fps"].as_f64().unwrap() >= 96.0);
        assert_eq!(job["artifact"]["factor"], 4);
        let reused: serde_json::Value =
            serde_json::from_str(&request("GET", &path, vec![], "application/json").body).unwrap();
        assert_eq!(job["artifact"], reused["artifact"]);
        let output = std::env::var("BMX_TEST_OUTPUT").unwrap();
        let downloaded = Client::new()
            .get(job["artifact"]["url"].as_str().unwrap())
            .send()
            .unwrap()
            .error_for_status()
            .unwrap()
            .bytes()
            .unwrap();
        std::fs::write(format!("{output}/render-96fps.mp4"), downloaded).unwrap();
        std::fs::write(
            format!("{output}/live-job.json"),
            serde_json::to_vec_pretty(&job).unwrap(),
        )
        .unwrap();
    }
}
