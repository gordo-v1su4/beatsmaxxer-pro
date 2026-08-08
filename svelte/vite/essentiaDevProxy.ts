import type { Plugin } from 'vite';
import {
	analysisProxyConfigFromEnv,
	proxyAnalysisRequest,
	type AnalysisProxyConfig
} from '../../api/analyze/policy';
import { handleAccessGate } from '../../api/gate/handler';
import { accessGateConfigFromEnv, type AccessGateConfig } from '../../api/gate/policy';

async function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	if (chunks.length === 0) return undefined;
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return undefined;
	}
}

export function essentiaDevProxyPlugin(
	config: AnalysisProxyConfig,
	gate: AccessGateConfig = accessGateConfigFromEnv(process.env)
): Plugin {
	return {
		name: 'essentia-dev-proxy',
		configureServer(server) {
			// The gate runs in dev too, so a locally configured PIN behaves exactly
			// as it will in production rather than only being exercised after deploy.
			server.middlewares.use('/__api/gate', async (req, res) => {
				const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
				const result = handleAccessGate(
					{
						method: req.method,
						cookieHeader: req.headers.cookie,
						forwardedFor: req.socket.remoteAddress ?? undefined,
						forwardedProto: 'http',
						body
					},
					gate
				);
				res.statusCode = result.status;
				res.setHeader('Content-Type', 'application/json');
				res.setHeader('Cache-Control', 'no-store');
				if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie);
				res.end(result.body);
			});

			server.middlewares.use('/__api/analyze', async (req, res) => {
				const clientAbort = new AbortController();
				const onAborted = () => clientAbort.abort();
				req.once('aborted', onAborted);
				try {
					const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
					const result = await proxyAnalysisRequest(
						{
							method: req.method,
							endpoint: requestUrl.pathname.replace(/^\/+/, ''),
							contentType: req.headers['content-type'],
							contentLength: req.headers['content-length'],
							cookieHeader: req.headers.cookie,
							body: req,
							signal: clientAbort.signal
						},
						config,
						{},
						gate
					);
					if (!result || res.destroyed || res.writableEnded) return;
					res.statusCode = result.status;
					res.setHeader('Content-Type', result.contentType);
					if (result.status === 405) res.setHeader('Allow', 'POST');
					res.end(result.body);
				} finally {
					req.off('aborted', onAborted);
				}
			});
		}
	};
}

export { analysisProxyConfigFromEnv };
