// src-tauri/src/main.rs
//
// Thin binary entrypoint. Windows/Linux release builds without a console
// window use `windows_subsystem = "windows"`; the attribute is a no-op on
// non-Windows targets, which is exactly the "config later, not rework"
// posture this scaffold is built for. All real logic lives in
// `lengyue_lib::run()` (src/lib.rs) per the Tauri v2 mobile-compatible
// project shape (a library target the eventual mobile targets link
// against, plus this thin desktop binary entrypoint).
//
// License: Public Domain (The Unlicense)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lengyue_lib::run();
}
