use tauri::Manager;

mod env;
mod essentia;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env::load_repo_dotenv();
    env::log_essentia_startup();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main Tauri window is missing".to_string())?;
            // A launched desktop editor must become a real, visible window
            // immediately. An unfocused webview can be background-throttled
            // before media surfaces register.
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            essentia::essentia_configured,
            essentia::analyze_rhythm
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beatsmaxxer Pro desktop");
}
