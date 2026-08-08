//! IOSurface -> Metal -> wgpu import boundary.
//!
//! The unsafe contract is intentionally isolated here: `iosurface` must come
//! from a retained `NativeDecodeFrame`, its dimensions and BGRA format must
//! match the descriptor, and that owner must outlive all GPU work using the
//! returned texture.

use std::ffi::c_void;

use metal::foreign_types::ForeignType;
use metal::objc::runtime::Object;
use metal::objc::*;

#[allow(unexpected_cfgs)]
pub unsafe fn import_bgra_iosurface(
    device: &wgpu::Device,
    iosurface: *mut c_void,
    width: u32,
    height: u32,
) -> Result<wgpu::Texture, String> {
    if iosurface.is_null() {
        return Err("IOSurface pointer is null".into());
    }

    let hal_texture = unsafe {
        device.as_hal::<wgpu::hal::api::Metal, _, Result<wgpu::hal::metal::Texture, String>>(
            |hal_device| {
                let hal_device = hal_device
                    .ok_or_else(|| "wgpu device is not using the Metal backend".to_string())?;
                let raw_device = hal_device.raw_device();
                let raw_device = raw_device.lock();

                let descriptor = metal::TextureDescriptor::new();
                descriptor.set_texture_type(metal::MTLTextureType::D2);
                descriptor.set_pixel_format(metal::MTLPixelFormat::BGRA8Unorm);
                descriptor.set_width(width as u64);
                descriptor.set_height(height as u64);
                descriptor.set_usage(metal::MTLTextureUsage::ShaderRead);
                descriptor.set_storage_mode(metal::MTLStorageMode::Managed);

                let texture_ptr: *mut Object = msg_send![
                    raw_device.as_ptr(),
                    newTextureWithDescriptor: descriptor.as_ptr()
                    iosurface: iosurface
                    plane: 0usize
                ];
                if texture_ptr.is_null() {
                    return Err(
                        "Metal newTextureWithDescriptor:iosurface:plane: returned null".into(),
                    );
                }
                let metal_texture =
                    metal::Texture::from_ptr(texture_ptr.cast::<metal::MTLTexture>());
                Ok(wgpu::hal::metal::Device::texture_from_raw(
                    metal_texture,
                    wgpu::TextureFormat::Bgra8Unorm,
                    metal::MTLTextureType::D2,
                    1,
                    1,
                    wgpu::hal::CopyExtent {
                        width,
                        height,
                        depth: 1,
                    },
                ))
            },
        )?
    };

    let descriptor = wgpu::TextureDescriptor {
        label: Some("Beatsmaxxer VideoToolbox IOSurface"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Bgra8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    };
    Ok(
        unsafe {
            device.create_texture_from_hal::<wgpu::hal::api::Metal>(hal_texture, &descriptor)
        },
    )
}
