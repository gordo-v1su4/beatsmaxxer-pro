use tauri::{LogicalSize, Manager, WebviewWindow};

mod env;
mod essentia;

/// The preferred working size measured from the user's Windows desktop. Keep
/// this in sync with `tauri.conf.json`; setup reapplies it after Tauri creates
/// the window so a previous larger design default cannot win during launch.
const DESIGN_WIDTH: f64 = 1786.0;
const DESIGN_HEIGHT: f64 = 1243.0;

fn desktop_window_title(version: &str) -> String {
    format!("Beatsmaxxer Pro · {version}")
}

/// Open at the size the layout was designed for, but never larger than the
/// display. The window used to open at 1440x900, which squeezed the modules to
/// 273px and made their labels unreadable — the app was not too big, the window
/// was too small. Clamping rather than hardcoding matters because a size that
/// fits a 2560 monitor would open partly offscreen on a 1920 laptop.
fn fit_window_to_display(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
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
            let title = desktop_window_title(&app.package_info().version.to_string());
            window
                .set_title(&title)
                .map_err(|error| error.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_title_includes_the_packaged_version() {
        assert_eq!(desktop_window_title("0.2.1"), "Beatsmaxxer Pro · 0.2.1");
    }

    #[test]
    fn preferred_startup_size_matches_the_measured_windows_window() {
        assert_eq!((DESIGN_WIDTH, DESIGN_HEIGHT), (1786.0, 1243.0));
    }
}
