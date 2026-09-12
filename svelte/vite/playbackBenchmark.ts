import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, relative, sep, extname } from 'node:path';
import type { Plugin } from 'vite';

/** Dev-only benchmark entry: exercises live app imports without shipping a second app. */
export function playbackBenchmarkPlugin(): Plugin {
  return {
    name: 'playback-benchmark',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname?.startsWith('/benchmark-fixtures/')) {
          try {
            const root = resolve(server.config.root, '.artifacts/benchmark-fixtures');
            const file = resolve(root, decodeURIComponent(pathname.slice('/benchmark-fixtures/'.length)));
            const suffix = relative(root, file);
            if (!suffix || suffix === '..' || suffix.startsWith(`..${sep}`) || /^[A-Za-z]:/.test(suffix)) {
              res.statusCode = 403; res.end(); return;
            }
            const info = await stat(file);
            if (!info.isFile()) { res.statusCode = 404; res.end(); return; }
            res.setHeader('Content-Type', ({'.json':'application/json','.mp4':'video/mp4','.mp3':'audio/mpeg'} as Record<string,string>)[extname(file)] ?? 'application/octet-stream');
            res.setHeader('Accept-Ranges', 'bytes');
            let start = 0, end = info.size - 1;
            if (req.headers.range) {
              const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
              if (!range) { res.statusCode = 416; res.end(); return; }
              start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
              if (start > end || start < 0) { res.statusCode = 416; res.end(); return; }
              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
            }
            res.setHeader('Content-Length', end-start+1);
            if (req.method === 'HEAD') { res.end(); return; }
            const stream = createReadStream(file, {start,end});
            stream.on('error', () => res.destroy());
            res.on('close', () => stream.destroy());
            stream.pipe(res);
          } catch { res.statusCode = 404; res.end('Run bun run benchmark:prepare first'); }
          return;
        }
        if (pathname !== '/benchmark' && pathname !== '/benchmark/') return next();
        try {
          const html = await readFile(resolve(server.config.root, 'benchmark/index.html'), 'utf8');
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml('/benchmark', html));
        } catch (error) { next(error); }
      });
    }
  };
}
