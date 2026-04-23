const COMMANDS: &[&str] = &[
    "get_windows",
    "granted_permissions",
    "open_screen_recording_prefs",
    "start_session",
    "stop_session",
    "session_state",
    "capture_manual",
    "toggle_session",
    "get_recent_meetings",
];

fn main() {
    // Build the Swift sidecar before tauri_build runs, so bundle.externalBin
    // finds the binary. Re-run when sidecar sources change.
    println!("cargo:rerun-if-changed=../sidecar/Package.swift");
    println!("cargo:rerun-if-changed=../sidecar/Sources");
    println!("cargo:rerun-if-changed=../scripts/build-sidecar.sh");

    let status = std::process::Command::new("../scripts/build-sidecar.sh")
        .status()
        .expect("failed to spawn scripts/build-sidecar.sh");
    if !status.success() {
        panic!("scripts/build-sidecar.sh exited with status {status}");
    }

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
