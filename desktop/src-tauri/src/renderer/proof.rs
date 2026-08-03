use bsp_decode::videotoolbox::VideoToolboxDecoder;

use super::macos_import::import_bgra_iosurface;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IOSurfaceWgpuProof {
    pub backend: &'static str,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: i64,
    pub iosurface_present: bool,
    pub metal_adapter: String,
    pub gpu_submission_count: u64,
    pub decoded_cpu_bytes: u64,
    pub frame_ipc_bytes: u64,
    pub diagnostic_readback_bytes: u64,
    pub diagnostic_checksum: u64,
}

pub fn run_iosurface_wgpu_proof(path: &str) -> Result<IOSurfaceWgpuProof, String> {
    let mut decoder =
        VideoToolboxDecoder::open(path, 256, 144, 0).map_err(|error| error.to_string())?;
    let frame = decoder
        .next_native_frame("proof", 1)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "VideoToolbox produced no proof frame".to_string())?;

    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::METAL,
        ..Default::default()
    });
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        force_fallback_adapter: false,
        compatible_surface: None,
    }))
    .ok_or_else(|| "request Metal adapter returned no compatible adapter".to_string())?;
    let adapter_info = adapter.get_info();
    let (device, queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: Some("Beat Surfer IOSurface proof"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            memory_hints: wgpu::MemoryHints::Performance,
        },
        None,
    ))
    .map_err(|error| format!("request Metal device: {error}"))?;

    let texture = unsafe {
        import_bgra_iosurface(&device, frame.iosurface_ptr(), frame.width, frame.height)?
    };
    let unpadded_bytes_per_row = frame.width * 4;
    let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(256) * 256;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("IOSurface proof readback"),
        size: (padded_bytes_per_row * frame.height) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("IOSurface proof submission"),
    });
    encoder.insert_debug_marker("retained VideoToolbox IOSurface imported into wgpu");
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(frame.height),
            },
        },
        wgpu::Extent3d {
            width: frame.width,
            height: frame.height,
            depth_or_array_layers: 1,
        },
    );
    queue.submit([encoder.finish()]);
    let readback_slice = readback.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    readback_slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result);
    });
    device.poll(wgpu::Maintain::Wait);
    receiver
        .recv()
        .map_err(|error| format!("receive proof readback: {error}"))?
        .map_err(|error| format!("map proof readback: {error}"))?;
    let mapped = readback_slice.get_mapped_range();
    let diagnostic_checksum = mapped
        .chunks(padded_bytes_per_row as usize)
        .take(frame.height as usize)
        .flat_map(|row| row[..unpadded_bytes_per_row as usize].iter().copied())
        .fold(0u64, |checksum, byte| {
            checksum.wrapping_mul(16_777_619).wrapping_add(byte as u64)
        });
    let diagnostic_readback_bytes = (unpadded_bytes_per_row * frame.height) as u64;
    drop(mapped);
    readback.unmap();
    if diagnostic_checksum == 0 {
        return Err("IOSurface proof readback produced an empty checksum".into());
    }
    drop(texture);

    Ok(IOSurfaceWgpuProof {
        backend: "videotoolbox-iosurface-wgpu-metal",
        width: frame.width,
        height: frame.height,
        timestamp_us: frame.timestamp_us,
        iosurface_present: frame.has_iosurface(),
        metal_adapter: adapter_info.name,
        gpu_submission_count: 1,
        decoded_cpu_bytes: 0,
        frame_ipc_bytes: 0,
        diagnostic_readback_bytes,
        diagnostic_checksum,
    })
}
