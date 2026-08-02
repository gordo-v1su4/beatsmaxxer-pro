//! Retained Core Video frame storage for the macOS compositor.

use objc2_core_foundation::CFRetained;
use objc2_core_video::{
    CVImageBuffer, CVPixelBufferGetHeight, CVPixelBufferGetIOSurface, CVPixelBufferGetWidth,
};
#[cfg(feature = "cpu-frame-bridge")]
use objc2_core_video::{
    CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};

#[cfg(feature = "cpu-frame-bridge")]
use crate::DecodeFrame;
use crate::{DecodeError, NativeDecodeFrame};

impl NativeDecodeFrame {
    pub(crate) fn from_pixel_buffer(
        module_id: String,
        timestamp_us: i64,
        sequence: u64,
        pixel_buffer: CFRetained<CVImageBuffer>,
    ) -> Result<Self, DecodeError> {
        let width = CVPixelBufferGetWidth(&pixel_buffer) as u32;
        let height = CVPixelBufferGetHeight(&pixel_buffer) as u32;
        if CVPixelBufferGetIOSurface(Some(&pixel_buffer)).is_none() {
            return Err(DecodeError::Decode(
                "VideoToolbox returned a pixel buffer without IOSurface backing".into(),
            ));
        }
        Ok(Self {
            module_id,
            width,
            height,
            timestamp_us,
            sequence,
            pixel_buffer,
        })
    }

    /// Borrow the retained Core Video object. The native compositor imports
    /// its IOSurface into Metal/wgpu while this frame remains alive.
    pub fn pixel_buffer(&self) -> &CVImageBuffer {
        &self.pixel_buffer
    }

    pub fn has_iosurface(&self) -> bool {
        CVPixelBufferGetIOSurface(Some(&self.pixel_buffer)).is_some()
    }

    /// Return the process-local IOSurface pointer for immediate Metal import.
    /// The pointer remains valid only while this frame retains its pixel buffer.
    pub fn iosurface_ptr(&self) -> *mut std::ffi::c_void {
        CVPixelBufferGetIOSurface(Some(&self.pixel_buffer))
            .map(|surface| CFRetained::as_ptr(&surface).as_ptr().cast())
            .unwrap_or(std::ptr::null_mut())
    }

    /// Transitional escape hatch for the old WebView BSPF bridge. Native
    /// compositor code must use `pixel_buffer` instead so decoded pixels never
    /// cross the Rust/JavaScript boundary.
    #[cfg(feature = "cpu-frame-bridge")]
    pub fn into_cpu_frame(self) -> Result<DecodeFrame, DecodeError> {
        let lock_flags = CVPixelBufferLockFlags::ReadOnly;
        let lock_result = unsafe { CVPixelBufferLockBaseAddress(&self.pixel_buffer, lock_flags) };
        if lock_result != 0 {
            return Err(DecodeError::Decode(format!(
                "CVPixelBuffer lock failed: {lock_result}"
            )));
        }

        let width = CVPixelBufferGetWidth(&self.pixel_buffer);
        let height = CVPixelBufferGetHeight(&self.pixel_buffer);
        let bytes_per_row = CVPixelBufferGetBytesPerRow(&self.pixel_buffer);
        let base = CVPixelBufferGetBaseAddress(&self.pixel_buffer).cast::<u8>();
        let mut bgra = vec![0u8; width * height * 4];
        if !base.is_null() {
            for row in 0..height {
                let source =
                    unsafe { std::slice::from_raw_parts(base.add(row * bytes_per_row), width * 4) };
                let target = &mut bgra[row * width * 4..(row + 1) * width * 4];
                target.copy_from_slice(source);
            }
        }
        let unlock_result =
            unsafe { CVPixelBufferUnlockBaseAddress(&self.pixel_buffer, lock_flags) };
        if unlock_result != 0 {
            return Err(DecodeError::Decode(format!(
                "CVPixelBuffer unlock failed: {unlock_result}"
            )));
        }

        Ok(DecodeFrame {
            module_id: self.module_id,
            width: self.width,
            height: self.height,
            timestamp_us: self.timestamp_us,
            sequence: self.sequence,
            bgra,
        })
    }
}
