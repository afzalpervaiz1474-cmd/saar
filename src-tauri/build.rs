use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    // Embed a compile-time build timestamp (seconds since the Unix epoch). The
    // command layer converts it to ISO-8601 for the About & Diagnostics page.
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=SHIELDFORGE_BUILD_TIME={secs}");

    tauri_build::build()
}
