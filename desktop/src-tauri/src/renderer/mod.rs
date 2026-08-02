#[cfg(target_os = "macos")]
mod compositor;
#[cfg(target_os = "macos")]
mod macos_import;
#[cfg(target_os = "macos")]
mod macos_view;
#[cfg(target_os = "macos")]
mod proof;

#[cfg(target_os = "macos")]
pub use compositor::{
    NativeCompositorSnapshot, NativeCompositorState, NativeCutSnapshot, NativeSurfaceRect,
    NativeSurfaceSnapshot,
};
#[cfg(target_os = "macos")]
pub use proof::{run_iosurface_wgpu_proof, IOSurfaceWgpuProof};
