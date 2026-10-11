// Verified variants from the saved interpolation-manifest.json (RIFE v4.6).
// Content identity survives file renames; a filename or 96 FPS alone is not proof.
const rife4Hashes = new Set([
  '6f31e3405be5f61e7e16262413d27426e395823d125b1d00adca8c0abc79e8b9',
  '5fe7d4dc8bf5e24402bb92f6155054ea5ffbbf1f6ee3d54cceffdb470a44fd6f',
  '1f85f8115037722fdbb21c2a1c5fe6a7dcc0191f637177225f7561625835a28b',
  'c52b971a6e716a82e3894ead1d00aa088258038abd6393f513a8c5c11db091c9'
]);
const generatedHashes=new Map<string,number>();
/** Packet timestamp division can report nominal 96 FPS as 95.99999999999997. */
export const meetsSlowMotionFrameRate = (fps:number) => Number.isFinite(fps) && fps >= 96 - 1e-6;
export function rememberGeneratedInterpolation(sha256:string,factor:number){
  if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isInteger(factor)||factor<4||factor>16)throw new Error('Invalid verified interpolation metadata');
  generatedHashes.set(sha256,factor);
}
export const verifiedInterpolationFactor = (sha256: string) => generatedHashes.get(sha256.toLowerCase()) ?? (rife4Hashes.has(sha256.toLowerCase()) ? 4 : 1);

async function verifySource(source: Blob | string): Promise<number> {

    const blob = typeof source === 'string' ? await fetch(source).then(r => {
      if (!r.ok) throw new Error('Media unavailable');
      return r.blob();
    }) : source;
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return verifiedInterpolationFactor(Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join(''));
}

const blobChecks = new WeakMap<Blob, Promise<number>>();
const urlChecks = new Map<string, Promise<number>>();
/** Share in-flight and completed verification across library and runtime mounts. */
export function identifyInterpolation(source: Blob | string, fps: number): Promise<number> {
  if (typeof source !== 'string') {
    let check = blobChecks.get(source);
    if (!check) {
      // A resident bank has already decoded and measured this exact Blob.
      // Keep its low-FPS classification so recall need not hash it on a cut.
      check = !meetsSlowMotionFrameRate(fps) ? Promise.resolve(1) : verifySource(source).catch(error => { blobChecks.delete(source); throw error; });
      blobChecks.set(source, check);
    }
    return check;
  }
  let check = urlChecks.get(source);
  if (!check) {
    check = !meetsSlowMotionFrameRate(fps) ? Promise.resolve(1) : verifySource(source).catch(error => {
      if (urlChecks.get(source) === check) urlChecks.delete(source);
      throw error;
    });
    urlChecks.set(source, check);
    // Bound URL retention; Blob entries disappear with their source objects.
    if (urlChecks.size > 64) urlChecks.delete(urlChecks.keys().next().value!);
  }
  return check;
}
