#![cfg(target_os = "macos")]

pub mod capture;

pub use capture::MacosCapture;
