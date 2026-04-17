#![cfg(target_os = "macos")]

use std::path::Path;

use async_trait::async_trait;
use core_media_rs::cm_sample_buffer::CMSampleBuffer;
use core_video_rs::cv_pixel_buffer::lock::{BaseAddressGuard, LockGuard, LockTrait};
use screencapturekit::shareable_content::SCShareableContent;
use screencapturekit::stream::content_filter::SCContentFilter;
use screencapturekit::stream::configuration::SCStreamConfiguration;
use screencapturekit::stream::output_trait::SCStreamOutputTrait;
use screencapturekit::stream::output_type::SCStreamOutputType;
use screencapturekit::stream::SCStream;

use crate::platform::{
    Bounds, CaptureBackend, Frame, PlatformError, PlatformResult, WindowId, WindowInfo,
};

pub struct MacosCapture;

impl MacosCapture {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CaptureBackend for MacosCapture {
    async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>> {
        let content = tokio::task::spawn_blocking(|| {
            SCShareableContent::get().map_err(|e| PlatformError::Backend(e.to_string()))
        })
        .await
        .map_err(|e| PlatformError::Backend(e.to_string()))??;

        let windows = content
            .windows()
            .into_iter()
            .filter(|w| w.is_on_screen() && !w.title().is_empty())
            .map(|w| {
                let frame = w.get_frame();
                WindowInfo {
                    id: w.window_id() as WindowId,
                    title: w.title(),
                    app: w.owning_application().application_name(),
                    bounds: Bounds {
                        x: frame.origin.x as f64,
                        y: frame.origin.y as f64,
                        width: frame.size.width as f64,
                        height: frame.size.height as f64,
                    },
                }
            })
            .collect();

        Ok(windows)
    }

    async fn capture_window(&self, id: WindowId, dest_dir: &Path) -> PlatformResult<Frame> {
        let dest_dir = dest_dir.to_path_buf();
        let (width, height, png_path, captured_at) = tokio::task::spawn_blocking(
            move || -> PlatformResult<(u32, u32, std::path::PathBuf, chrono::DateTime<chrono::Utc>)> {
                // Find the window in shareable content
                let content = SCShareableContent::get()
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;
                let window = content
                    .windows()
                    .into_iter()
                    .find(|w| w.window_id() as WindowId == id)
                    .ok_or(PlatformError::WindowNotFound(id))?;

                let frame = window.get_frame();
                let w = frame.size.width as u32;
                let h = frame.size.height as u32;
                // Clamp to at least 1x1 to avoid zero-size config rejection
                let cap_w = w.max(1);
                let cap_h = h.max(1);

                let filter = SCContentFilter::new().with_desktop_independent_window(&window);
                let config = SCStreamConfiguration::new()
                    .set_width(cap_w)
                    .map_err(|e| PlatformError::Backend(e.to_string()))?
                    .set_height(cap_h)
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;

                // One-shot frame capture via SCStream
                let (tx, rx) = std::sync::mpsc::channel::<CMSampleBuffer>();
                struct OneShot(std::sync::Mutex<Option<std::sync::mpsc::Sender<CMSampleBuffer>>>);
                impl SCStreamOutputTrait for OneShot {
                    fn did_output_sample_buffer(
                        &self,
                        sample_buffer: CMSampleBuffer,
                        of_type: SCStreamOutputType,
                    ) {
                        if of_type != SCStreamOutputType::Screen {
                            return;
                        }
                        if let Some(tx) = self.0.lock().unwrap().take() {
                            let _ = tx.send(sample_buffer);
                        }
                    }
                }

                let handler = OneShot(std::sync::Mutex::new(Some(tx)));
                let mut stream = SCStream::new(&filter, &config);
                stream.add_output_handler(handler, SCStreamOutputType::Screen);
                stream
                    .start_capture()
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;
                let recv_result = rx
                    .recv_timeout(std::time::Duration::from_secs(5))
                    .map_err(|_| PlatformError::Backend("no frame received within 5s".into()));
                // Always stop the stream, regardless of recv outcome
                let stop_result = stream
                    .stop_capture()
                    .map_err(|e| PlatformError::Backend(e.to_string()));
                // Propagate recv error first (proximate cause of failure)
                let sample = recv_result?;
                stop_result?;

                let pixel_buf = sample
                    .get_pixel_buffer()
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;

                let actual_w = pixel_buf.get_width();
                let actual_h = pixel_buf.get_height();
                let bytes_per_row = pixel_buf.get_bytes_per_row();
                // Usable pixels per row may be less than actual_w due to stride padding
                let pixels_per_row = (bytes_per_row / 4).min(actual_w);

                // Lock the pixel buffer for reading
                let guard: LockGuard<BaseAddressGuard<'_>> = pixel_buf
                    .lock()
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;
                let raw = guard.as_slice();

                // SCKit default pixel format is BGRA; convert to RGBA for PNG.
                // Use pixels_per_row to stay within stride bounds.
                let mut rgba: Vec<u8> = Vec::with_capacity((pixels_per_row * actual_h * 4) as usize);
                for row in 0..actual_h {
                    let row_start = (row * bytes_per_row) as usize;
                    for col in 0..pixels_per_row {
                        let px = row_start + (col * 4) as usize;
                        // BGRA → RGBA
                        rgba.push(raw[px + 2]); // R
                        rgba.push(raw[px + 1]); // G
                        rgba.push(raw[px]);     // B
                        rgba.push(raw[px + 3]); // A
                    }
                }
                drop(guard);

                // Use pixels_per_row as the PNG width (matches actual pixel data)
                let png_w = pixels_per_row;

                // Encode to PNG
                let mut png_bytes: Vec<u8> = Vec::new();
                {
                    let mut encoder = png::Encoder::new(&mut png_bytes, png_w, actual_h);
                    encoder.set_color(png::ColorType::Rgba);
                    encoder.set_depth(png::BitDepth::Eight);
                    let mut writer = encoder
                        .write_header()
                        .map_err(|e| PlatformError::Backend(e.to_string()))?;
                    writer
                        .write_image_data(&rgba)
                        .map_err(|e| PlatformError::Backend(e.to_string()))?;
                }

                std::fs::create_dir_all(&dest_dir)
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;
                let captured_at = chrono::Utc::now();
                let filename = format!("{}.png", captured_at.format("%Y-%m-%d_%H-%M-%S"));
                let png_path = dest_dir.join(filename);
                std::fs::write(&png_path, &png_bytes)
                    .map_err(|e| PlatformError::Backend(e.to_string()))?;

                Ok((png_w, actual_h, png_path, captured_at))
            },
        )
        .await
        .map_err(|e| PlatformError::Backend(e.to_string()))??;

        Ok(Frame { width, height, png_path, captured_at })
    }

    async fn screen_recording_granted(&self) -> bool {
        use core_graphics::access::ScreenCaptureAccess;
        ScreenCaptureAccess::default().preflight()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn list_windows_returns_at_least_one_on_a_normal_desktop() {
        let cap = MacosCapture::new();
        let windows = cap.list_windows().await.expect("list_windows");
        if std::env::var("CI").is_ok() {
            eprintln!("skipping list_windows assertion on CI");
            return;
        }
        assert!(!windows.is_empty(), "expected at least one visible titled window");
        for w in windows {
            assert!(w.bounds.width > 0.0);
            assert!(w.bounds.height > 0.0);
        }
    }

    /// Initialize NSApplication so that CoreGraphics (CGS) is connected to the
    /// Window Server. Required before calling SCStream in a plain test binary.
    #[cfg(test)]
    fn init_ns_application() {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let _: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
        }
    }

    #[tokio::test]
    async fn capture_window_writes_a_png_file() {
        if std::env::var("CI").is_ok() {
            eprintln!("skipping capture_window on CI");
            return;
        }
        // NSApplication must be initialized before SCStream can start_capture
        init_ns_application();
        let cap = MacosCapture::new();
        let windows = cap.list_windows().await.expect("list_windows");
        let window = windows.into_iter().next().expect("need at least one window for test");

        let tmp = tempfile::tempdir().expect("tempdir");
        let frame = cap.capture_window(window.id, tmp.path()).await.expect("capture");

        assert!(frame.png_path.exists(), "png must exist");
        let bytes = std::fs::read(&frame.png_path).expect("read png");
        assert!(bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]), "PNG magic bytes");
        assert!(frame.width > 0 && frame.height > 0);
    }
}
