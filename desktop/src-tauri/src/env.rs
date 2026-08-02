use std::path::PathBuf;

/// Load repo-root `.env`. Fills vars that are unset or blank in the process environment.
/// `CARGO_MANIFEST_DIR` is `desktop/src-tauri`; repo root is two levels up.
pub fn load_repo_dotenv() {
    let env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    if !env_path.is_file() {
        #[cfg(debug_assertions)]
        eprintln!(
            "[desktop] note: no repo-root .env at {} (copy from .env.example)",
            env_path.display()
        );
        return;
    }

    let Ok(iter) = dotenvy::from_path_iter(&env_path) else {
        #[cfg(debug_assertions)]
        eprintln!(
            "[desktop] note: could not parse {}",
            env_path.display()
        );
        return;
    };

    for item in iter.flatten() {
        let current = std::env::var(&item.0).unwrap_or_default();
        if current.trim().is_empty() {
            std::env::set_var(&item.0, &item.1);
        }
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
                "[desktop] Essentia: not configured — put secrets in repo-root .env (not .env.example)"
            );
        }
    }
}
