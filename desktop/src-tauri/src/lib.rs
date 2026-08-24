use tauri::{LogicalSize, Manager, WebviewWindow};

mod env;
mod essentia;

/// Open at a consistent share of whichever monitor owns the window. Monitor
/// dimensions are converted to logical pixels first, so Windows DPI scaling
/// cannot turn a physical-pixel measurement into an almost-fullscreen window.
const WINDOW_WIDTH_RATIO: f64 = 0.75;
const WINDOW_HEIGHT_RATIO: f64 = 0.75;
const MIN_WINDOW_WIDTH: f64 = 960.0;
const MIN_WINDOW_HEIGHT: f64 = 600.0;

fn desktop_window_title(version: &str) -> String {
    format!("Beatsmaxxer Pro · {version}")
}

fn preferred_window_size(screen: LogicalSize<f64>) -> LogicalSize<f64> {
    // Keep a small safety margin for window chrome and the taskbar on unusually
    // small displays while preserving the proportional default everywhere else.
    let available_width = (screen.width - 32.0).max(1.0);
    let available_height = (screen.height - 72.0).max(1.0);
    let width = (screen.width * WINDOW_WIDTH_RATIO)
        .max(MIN_WINDOW_WIDTH)
        .min(available_width);
    let height = (screen.height * WINDOW_HEIGHT_RATIO)
        .max(MIN_WINDOW_HEIGHT)
        .min(available_height);
    LogicalSize::new(width, height)
}

fn fit_window_to_display(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let screen = monitor.size().to_logical::<f64>(scale);
    let _ = window.set_size(preferred_window_size(screen));
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
        assert_eq!(desktop_window_title("0.2.2"), "Beatsmaxxer Pro · 0.2.2");
    }

    #[test]
    fn preferred_startup_size_is_relative_to_the_active_monitor() {
        assert_eq!(
            preferred_window_size(LogicalSize::new(1920.0, 1080.0)),
            LogicalSize::new(1440.0, 810.0)
        );
        assert_eq!(
            preferred_window_size(LogicalSize::new(2560.0, 1440.0)),
            LogicalSize::new(1920.0, 1080.0)
        );
    }
}
