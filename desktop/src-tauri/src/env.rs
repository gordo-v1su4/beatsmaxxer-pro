use std::path::PathBuf;

/// Load repo-root `.env` when vars are not already in the process environment.
/// `CARGO_MANIFEST_DIR` is `desktop/src-tauri`; repo root is two levels up.
pub fn load_repo_dotenv() {
    let env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    if let Err(error) = dotenvy::from_path(&env_path) {
        #[cfg(debug_assertions)]
        eprintln!(
            "[desktop] note: could not load {} ({error})",
            env_path.display()
        );
    }
}

pub fn log_essentia_startup() {
    #[cfg(debug_assertions)]
    {
        let base_url = std::env::var("ESSENTIA_API_BASE_URL")
            .unwrap_or_default()
            .trim()
            .to_string();
        let has_key = !std::env::var("ESSENTIA_API_KEY")
            .unwrap_or_default()
            .trim()
            .is_empty();
        let configured = !base_url.is_empty() && has_key;
        if configured {
            eprintln!("[desktop] Essentia: configured ({base_url})");
        } else {
            eprintln!(
                "[desktop] Essentia: not configured — set ESSENTIA_API_BASE_URL + ESSENTIA_API_KEY in repo-root .env"
            );
        }
    }
}
