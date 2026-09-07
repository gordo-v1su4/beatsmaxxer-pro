import { describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE_NAME, mintSessionToken } from "../../../../api/gate/policy";
import {
  mediaGatewayConfigFromEnv,
  studioChunkObjectKey,
} from "../../../../api/lib/mediaGateway";
import { proxyStorageUpload } from "../../../../api/storage/policy";

const gateway = mediaGatewayConfigFromEnv({
  MEDIA_GATEWAY_URL: "https://media.invalid",
  MEDIA_GATEWAY_TOKEN: "gateway-secret",
  MEDIA_GATEWAY_BUCKET: "beatsmaxxer-pro",
  MEDIA_GATEWAY_USER_ID: "beatsmaxxer-pro",
  MEDIA_GATEWAY_UPLOAD_PREFIX: "media-uploads",
});

const uploadId = "22222222-2222-4222-8222-222222222222";

function multipartBody(fileBytes: Uint8Array, boundary = "fixture-boundary") {
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="00000.part"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(preamble.byteLength + fileBytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(fileBytes, preamble.byteLength);
  body.set(closing, preamble.byteLength + fileBytes.byteLength);
  return body;
}

function stream(body: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  };
}

describe("storage upload policy", () => {
  it("stages chunk uploads through the media gateway", async () => {
    const chunk = new Uint8Array([9, 8, 7]);
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      bucket: gateway.bucket,
      objectKey: studioChunkObjectKey(gateway.uploadPrefix, uploadId, 0),
      publicUrl: "https://s3.invalid/beatsmaxxer-pro/chunk",
      mime: "application/octet-stream",
    }), { status: 200 }));
    const result = await proxyStorageUpload(
      {
        method: "POST",
        contentType: "multipart/form-data; boundary=fixture-boundary",
        uploadId,
        chunkIndex: "0",
        body: stream(multipartBody(chunk)),
      },
      gateway,
      { fetch: fetch as typeof globalThis.fetch },
      { pin: "" },
      "development",
    );
    expect(result?.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstCall = fetch.mock.calls.at(0);
    expect(firstCall?.[0]).toBe("https://media.invalid/upload");
    const body = result?.body ?? "";
    expect(body).toContain(studioChunkObjectKey(gateway.uploadPrefix, uploadId, 0));
  });

  it("requires a valid session when the access gate is enabled", async () => {
    const fetch = vi.fn();
    const locked = { pin: "1234" };
    const result = await proxyStorageUpload(
      {
        method: "POST",
        contentType: "multipart/form-data; boundary=fixture-boundary",
        uploadId,
        chunkIndex: "0",
        body: stream(multipartBody(new Uint8Array([1]))),
      },
      gateway,
      { fetch: fetch as typeof globalThis.fetch },
      locked,
      "development",
    );
    expect(result?.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows chunk uploads with a valid session cookie", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      bucket: gateway.bucket,
      objectKey: studioChunkObjectKey(gateway.uploadPrefix, uploadId, 0),
      publicUrl: "https://s3.invalid/beatsmaxxer-pro/chunk",
      mime: "application/octet-stream",
    }), { status: 200 }));
    const result = await proxyStorageUpload(
      {
        method: "POST",
        contentType: "multipart/form-data; boundary=fixture-boundary",
        uploadId,
        chunkIndex: "0",
        cookieHeader: `${ACCESS_COOKIE_NAME}=${mintSessionToken({ pin: "1234" })}`,
        body: stream(multipartBody(new Uint8Array([1]))),
      },
      gateway,
      { fetch: fetch as typeof globalThis.fetch },
      { pin: "1234" },
      "development",
    );
    expect(result?.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
