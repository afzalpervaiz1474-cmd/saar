//! ShieldForge Antivirus - Tauri desktop shell.
//!
//! The shell is intentionally thin: it wires the core services together and
//! exposes a small, validated command surface to the webview.

mod adapters;
mod commands;
mod platform;
mod state;

use state::AppState;
use tauri::Manager;

/// Builds and runs the application.
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_protection_status,
            commands::get_scanner_descriptor,
            commands::scan_start,
            commands::scan_progress,
            commands::scan_cancel,
            commands::scan_results,
            commands::quarantine_list,
            commands::quarantine_restore,
            commands::quarantine_delete,
            commands::update_status,
            commands::update_check,
            commands::history_list,
            commands::audit_list,
        ])
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        format!("cannot resolve the application data directory: {error}"),
                    ))
                })?;

            std::fs::create_dir_all(&data_dir).ok();

            match AppState::bootstrap(data_dir.clone()) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(error) => {
                    eprintln!("shieldforge: service start-up failed: {error}");
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("service start-up failed: {error}"),
                    )));
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the ShieldForge application");

    app.run(|_handle, _event| {});
}
