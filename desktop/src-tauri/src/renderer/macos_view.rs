//! Pass-through AppKit view used as the native compositor overlay.

use std::ffi::c_void;
use std::ptr::NonNull;

use objc2::rc::Retained;
use objc2::{define_class, msg_send, MainThreadOnly};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSView, NSWindowOrderingMode};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect};
use raw_window_handle::{
    AppKitDisplayHandle, AppKitWindowHandle, DisplayHandle, HandleError, HasDisplayHandle,
    HasWindowHandle, RawDisplayHandle, RawWindowHandle, WindowHandle,
};

define_class!(
    // SAFETY: NSView supports subclassing; this class adds no ivars and does
    // not implement Drop. AppKit access remains main-thread-only.
    #[unsafe(super = NSView)]
    #[thread_kind = MainThreadOnly]
    #[ivars = ()]
    struct BeatSurferCompositorView;

    unsafe impl NSObjectProtocol for BeatSurferCompositorView {}

    impl BeatSurferCompositorView {
        #[unsafe(method(isFlipped))]
        fn is_flipped(&self) -> bool {
            true
        }

        #[unsafe(method(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> *mut NSView {
            std::ptr::null_mut()
        }
    }
);

impl BeatSurferCompositorView {
    fn new(marker: objc2::MainThreadMarker, frame: NSRect) -> Retained<Self> {
        let allocated = Self::alloc(marker).set_ivars(());
        unsafe { msg_send![super(allocated), initWithFrame: frame] }
    }
}

/// Owned by AppKit after insertion. The raw wrapper is used only to create the
/// wgpu surface on the main thread; AppKit keeps the actual NSView alive.
pub struct CompositorViewHandle {
    view: NonNull<c_void>,
}

unsafe impl Send for CompositorViewHandle {}
unsafe impl Sync for CompositorViewHandle {}

impl HasWindowHandle for CompositorViewHandle {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let handle = AppKitWindowHandle::new(self.view);
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::AppKit(handle)) })
    }
}

impl HasDisplayHandle for CompositorViewHandle {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        Ok(unsafe {
            DisplayHandle::borrow_raw(RawDisplayHandle::AppKit(AppKitDisplayHandle::new()))
        })
    }
}

pub fn attach_overlay(content_view: *mut c_void) -> Result<CompositorViewHandle, String> {
    let marker = objc2::MainThreadMarker::new()
        .ok_or_else(|| "native compositor view must be attached on the main thread".to_string())?;
    let content = unsafe {
        (content_view as *mut NSView)
            .as_ref()
            .ok_or_else(|| "Tauri content view is null".to_string())?
    };
    let overlay = BeatSurferCompositorView::new(marker, content.bounds());
    overlay.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    content.addSubview_positioned_relativeTo(&overlay, NSWindowOrderingMode::Above, None);
    let view = NonNull::new(Retained::as_ptr(&overlay).cast_mut().cast::<c_void>())
        .ok_or_else(|| "native compositor overlay pointer is null".to_string())?;
    // `content` retained the overlay when it was added as a subview.
    drop(overlay);
    Ok(CompositorViewHandle { view })
}
