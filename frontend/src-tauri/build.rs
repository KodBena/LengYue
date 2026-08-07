// src-tauri/build.rs — standard Tauri v2 build-script hook.
//
// Generates the `tauri::generate_context!()` machinery (embedded
// `tauri.conf.json`, icons, and — on the platforms that use them —
// resource/capability manifests) at compile time. No project-specific
// logic here; this file is unmodified template boilerplate.
//
// License: Public Domain (The Unlicense)
fn main() {
    tauri_build::build()
}
