import type { Plugin } from 'vite';
import {
	analysisProxyConfigFromEnv,
	proxyAnalysisRequest,
	type AnalysisProxyConfig
} from '../../api/analyze/policy';

export function essentiaDevProxyPlugin(config: AnalysisProxyConfig): Plugin {
	return {
		name: 'essentia-dev-proxy',
		configureServer(server) {
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
							body: req,
							signal: clientAbort.signal
						},
						config
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
