import { createHmac, timingSafeEqual } from 'node:crypto';

/** Purpose-bound worker token; the shared media gateway token never goes to clients. */
export function workerToken(gatewayToken: string) {
  if (!gatewayToken) return '';
  return createHmac('sha256', gatewayToken).update('beatsmaxxer-interpolation-worker-v1').digest('hex');
}
export function validWorkerToken(value: string, token: string) {
  const a=Buffer.from(value), b=Buffer.from(token);
  return !!token && a.length===b.length && timingSafeEqual(a,b);
}
