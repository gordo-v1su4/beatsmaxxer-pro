use tauri::{LogicalSize, Manager, WebviewWindow};

mod env;
mod essentia;

/// What the rack actually needs to render at full size: five 420px modules per
/// row (2191px) plus the 361px FX rail and PGM column. Measured, not guessed.
const DESIGN_WIDTH: f64 = 2552.0;
const DESIGN_HEIGHT: f64 = 1440.0;

/// Open at the size the layout was designed for, but never larger than the
/// display. The window used to open at 1440x900, which squeezed the modules to
/// 273px and made their labels unreadable — the app was not too big, the window
/// was too small. Clamping rather than hardcoding matters because a size that
/// fits a 2560 monitor would open partly offscreen on a 1920 laptop.
fn fit_window_to_display(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let scale = monitor.scale_factor();
    let screen = monitor.size().to_logical::<f64>(scale);
    // Leave room for the taskbar and window chrome so nothing lands under them.
    let width = DESIGN_WIDTH.min(screen.width - 32.0).max(1280.0);
    let height = DESIGN_HEIGHT.min(screen.height - 72.0).max(800.0);
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.center();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env::load_repo_dotenv();
    env::log_essentia_startup();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "main Tauri window is missing".to_string())?;
            fit_window_to_display(&window);
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
