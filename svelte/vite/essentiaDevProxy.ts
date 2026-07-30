import type { Plugin } from 'vite';

async function readRequestBody(req: AsyncIterable<Uint8Array>) {
	const chunks: Uint8Array[] = [];
	for await (const chunk of req) chunks.push(chunk);
	const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const buffer = new ArrayBuffer(size);
	const body = new Uint8Array(buffer);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return buffer;
}

function postEssentiaBytes(
	apiBaseUrl: string,
	apiKey: string,
	endpointName: 'fast' | 'rhythm',
	contentType: string,
	body: ArrayBuffer
) {
	const endpoint = new URL(`${apiBaseUrl.replace(/\/+$/, '')}/analyze/${endpointName}`);
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': contentType,
			...(apiKey ? { 'X-API-Key': apiKey } : {})
		},
		body
	});
}

export function essentiaDevProxyPlugin(
	apiBaseUrl: string,
	apiKey: string
): Plugin {
	return {
		name: 'essentia-dev-proxy',
		configureServer(server) {
			server.middlewares.use('/__api/analyze', async (req, res) => {
				try {
					const requestUrl = new URL(req.url || '/', 'http://127.0.0.1:5174');
					const endpointName = requestUrl.pathname.replace(/^\/+/, '');
					if (
						req.method !== 'POST' ||
						(endpointName !== 'fast' && endpointName !== 'rhythm')
					) {
						res.statusCode = 404;
						res.end();
						return;
					}

					const contentType = req.headers['content-type'];
					if (!contentType) {
						res.statusCode = 400;
						res.setHeader('Content-Type', 'application/json');
						res.end(JSON.stringify({ detail: 'Missing content type' }));
						return;
					}

					const body = await readRequestBody(req);
					const upstream = await postEssentiaBytes(
						apiBaseUrl,
						apiKey,
						endpointName,
						contentType,
						body
					);
					const text = await upstream.text();
					res.statusCode = upstream.status;
					res.setHeader(
						'Content-Type',
						upstream.headers.get('content-type') || 'application/json'
					);
					res.end(text);
				} catch (error) {
					res.statusCode = 500;
					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							detail: error instanceof Error ? error.message : 'Analysis proxy failed'
						})
					);
				}
			});
		}
	};
}
