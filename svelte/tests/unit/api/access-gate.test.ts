import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE_NAME,
  ACCESS_MAX_ATTEMPTS,
  ACCESS_SESSION_TTL_MS,
  accessGateConfigFromEnv,
  isAccessGateEnabled,
  isCorrectPin,
  isValidSessionToken,
  mintSessionToken,
  parseCookie,
  resetAttemptsForTest,
  sessionCookie
} from '../../../../api/gate/policy';
import { handleAccessGate } from '../../../../api/gate/handler';

const gate = { pin: '4821' };
const open = { pin: '' };

describe('access gate policy', () => {
  beforeEach(() => resetAttemptsForTest());

  it('is disabled when no PIN is configured, so a half-configured deploy is not bricked', () => {
    expect(isAccessGateEnabled(accessGateConfigFromEnv({}))).toBe(false);
    expect(isAccessGateEnabled(accessGateConfigFromEnv({ APP_ACCESS_PIN: '  ' }))).toBe(false);
    expect(isAccessGateEnabled(accessGateConfigFromEnv({ APP_ACCESS_PIN: '4821' }))).toBe(true);
  });

  it('accepts only the exact PIN', () => {
    expect(isCorrectPin('4821', gate)).toBe(true);
    expect(isCorrectPin('4822', gate)).toBe(false);
    expect(isCorrectPin('482', gate)).toBe(false);
    expect(isCorrectPin('48211', gate)).toBe(false);
    expect(isCorrectPin('', gate)).toBe(false);
    expect(isCorrectPin(undefined, gate)).toBe(false);
    expect(isCorrectPin(4821, gate)).toBe(false);
  });

  it('round-trips a session token and rejects tampering', () => {
    const token = mintSessionToken(gate);
    expect(isValidSessionToken(token, gate)).toBe(true);

    const [expiry, signature] = token.split('.');
    expect(isValidSessionToken(`${expiry}.${'0'.repeat(signature!.length)}`, gate)).toBe(false);
    // Extending the expiry invalidates the signature it was minted with.
    expect(isValidSessionToken(`${Number(expiry) + 60_000}.${signature}`, gate)).toBe(false);
    expect(isValidSessionToken(token, { pin: '9999' })).toBe(false);
    expect(isValidSessionToken(undefined, gate)).toBe(false);
    expect(isValidSessionToken('nonsense', gate)).toBe(false);
  });

  it('rejects an expired token', () => {
    const token = mintSessionToken(gate, 0);
    expect(isValidSessionToken(token, gate, 1)).toBe(true);
    expect(isValidSessionToken(token, gate, ACCESS_SESSION_TTL_MS + 1)).toBe(false);
  });

  it('parses its own cookie back out of a header', () => {
    const header = `theme=dark; ${sessionCookie('abc.def', true).split(';')[0]}; other=1`;
    expect(parseCookie(header, ACCESS_COOKIE_NAME)).toBe('abc.def');
    expect(parseCookie(undefined, ACCESS_COOKIE_NAME)).toBeUndefined();
    expect(parseCookie('unrelated=1', ACCESS_COOKIE_NAME)).toBeUndefined();
  });

  it('marks the cookie HttpOnly and SameSite, and Secure only over https', () => {
    const secure = sessionCookie('t', true);
    expect(secure).toContain('HttpOnly');
    expect(secure).toContain('SameSite=Strict');
    expect(secure).toContain('Secure');
    expect(sessionCookie('t', false)).not.toContain('Secure');
  });
});

describe('access gate handler', () => {
  beforeEach(() => resetAttemptsForTest());

  it('reports the gate as not required when no PIN is set', () => {
    const result = handleAccessGate({ method: 'GET' }, open);
    expect(JSON.parse(result.body)).toEqual({ required: false, unlocked: true });
  });

  it('reports locked until a valid cookie arrives', () => {
    const locked = handleAccessGate({ method: 'GET' }, gate);
    expect(JSON.parse(locked.body)).toEqual({ required: true, unlocked: false });

    const cookieHeader = `${ACCESS_COOKIE_NAME}=${mintSessionToken(gate)}`;
    const unlocked = handleAccessGate({ method: 'GET', cookieHeader }, gate);
    expect(JSON.parse(unlocked.body)).toEqual({ required: true, unlocked: true });
  });

  it('issues a cookie for the right PIN and nothing for the wrong one', () => {
    const good = handleAccessGate({ method: 'POST', body: { pin: '4821' } }, gate);
    expect(good.status).toBe(200);
    expect(good.setCookie).toContain(`${ACCESS_COOKIE_NAME}=`);
    expect(good.setCookie).toContain('HttpOnly');

    const bad = handleAccessGate({ method: 'POST', body: { pin: 'nope' } }, gate);
    expect(bad.status).toBe(401);
    expect(bad.setCookie).toBeUndefined();
    expect(bad.body).not.toContain('4821');
  });

  it('never echoes the PIN in any response', () => {
    for (const request of [
      { method: 'GET' },
      { method: 'POST', body: { pin: '4821' } },
      { method: 'POST', body: { pin: 'wrong' } },
      { method: 'DELETE' }
    ]) {
      expect(handleAccessGate(request, gate).body).not.toContain('4821');
    }
  });

  it('throttles repeated failures from one client', () => {
    const attempt = () =>
      handleAccessGate({ method: 'POST', forwardedFor: '203.0.113.7', body: { pin: 'x' } }, gate);
    for (let i = 0; i < ACCESS_MAX_ATTEMPTS; i++) expect(attempt().status).toBe(401);
    expect(attempt().status).toBe(429);

    // A different client is unaffected by another's failures.
    const other = handleAccessGate(
      { method: 'POST', forwardedFor: '198.51.100.4', body: { pin: '4821' } },
      gate
    );
    expect(other.status).toBe(200);
  });

  it('clears the failure count once the correct PIN lands', () => {
    const from = (pin: string) =>
      handleAccessGate({ method: 'POST', forwardedFor: '203.0.113.9', body: { pin } }, gate);
    for (let i = 0; i < ACCESS_MAX_ATTEMPTS - 1; i++) from('x');
    expect(from('4821').status).toBe(200);
    expect(from('x').status).toBe(401);
  });

  it('rejects methods other than GET and POST', () => {
    expect(handleAccessGate({ method: 'DELETE' }, gate).status).toBe(405);
  });
});
