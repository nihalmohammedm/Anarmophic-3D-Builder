// Anamorphic Logo Maker – server
// Serves the tool and turns transparent PNG frames into a ProRes 4444 .mov (with alpha) using ffmpeg.
//
// Local:   node server.js            -> http://localhost:8787
// Docker:  see Dockerfile (Dokploy)
//
// Environment variables (all optional):
//   PORT                 listen port                                   (default 8787)
//   MAX_FRAMES           max frames per video                          (default 1800)
//   MAX_FRAME_MB         max size of one uploaded PNG frame            (default 40)
//   MAX_CONCURRENT       max simultaneous encodes                      (default 2)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = +process.env.PORT || 8787;
const MAX_FRAMES = +process.env.MAX_FRAMES || 1800;
const MAX_FRAME_BYTES = (+process.env.MAX_FRAME_MB || 40) * 1024 * 1024;
const MAX_CONCURRENT = +process.env.MAX_CONCURRENT || 2;
const ROOT = __dirname;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const JOB_RE = /^[a-z0-9]{4,32}$/;
const TMP = path.join(os.tmpdir(), 'anamorphic');
let encoding = 0;

fs.mkdirSync(TMP, { recursive: true });
const jobDir = id => path.join(TMP, id);

// remove abandoned jobs (e.g. browser closed mid-render)
setInterval(() => {
  fs.readdir(TMP, (e, names) => (names || []).forEach(n => {
    const p = path.join(TMP, n);
    fs.stat(p, (e2, st) => { if (!e2 && Date.now() - st.mtimeMs > 30 * 60 * 1000) fs.rm(p, { recursive: true, force: true }, () => {}); });
  }));
}, 5 * 60 * 1000).unref();

const send = (res, code, body, type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // health check for Docker / Dokploy
  if (url.pathname === '/health') return send(res, 200, 'ok');

  // The page is served from this same origin, so no CORS is needed (and none is granted).
  if (url.pathname === '/api/ping') {
    return send(res, 200, JSON.stringify({ ok: true, ffmpeg: hasFfmpeg }), 'application/json');
  }

  if (url.pathname === '/api/frame' && req.method === 'POST') {
    const job = url.searchParams.get('job') || '';
    const n = parseInt(url.searchParams.get('n'), 10);
    if (!JOB_RE.test(job) || !(n >= 0 && n < MAX_FRAMES)) return send(res, 400, 'bad request');
    const dir = jobDir(job);
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.createWriteStream(path.join(dir, String(n).padStart(5, '0') + '.png'));
    let bytes = 0, aborted = false;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_FRAME_BYTES && !aborted) { aborted = true; out.destroy(); send(res, 413, 'frame too large'); req.destroy(); }
    });
    req.pipe(out);
    out.on('finish', () => { if (!aborted) send(res, 200, 'ok'); });
    out.on('error', () => { if (!aborted) send(res, 500, 'write error'); });
    return;
  }

  if (url.pathname === '/api/encode' && req.method === 'POST') {
    const job = url.searchParams.get('job') || '';
    if (!JOB_RE.test(job)) return send(res, 400, 'bad request');
    if (!hasFfmpeg) return send(res, 500, 'ffmpeg is not installed on the server');
    if (encoding >= MAX_CONCURRENT) return send(res, 503, 'Server is busy encoding other videos – try again in a minute.');
    const dir = jobDir(job);
    if (!fs.existsSync(dir)) return send(res, 400, 'no frames for this job');
    const fps = String(Math.min(120, Math.max(1, +url.searchParams.get('fps') || 30)));
    const mp4 = url.searchParams.get('format') === 'mp4';
    const outFile = path.join(dir, mp4 ? 'out.mp4' : 'out.mov');
    const input = ['-y', '-framerate', fps, '-i', path.join(dir, '%05d.png')];
    const codec = mp4
      // H.264 for sharing/social: opaque (the page bakes the background colour into the frames), broad compatibility
      ? ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart']
      // ProRes 4444 with alpha for editors
      : ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0'];
    encoding++;
    const ff = spawn('ffmpeg', [...input, ...codec, outFile]);
    const killer = setTimeout(() => ff.kill('SIGKILL'), 10 * 60 * 1000);
    let log = '';
    ff.stderr.on('data', d => { log = (log + d).slice(-2000); });
    ff.on('close', code => {
      clearTimeout(killer); encoding--;
      const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
      if (code !== 0) { cleanup(); return send(res, 500, 'ffmpeg failed:\n' + log.slice(-800)); }
      const size = fs.statSync(outFile).size;
      res.writeHead(200, { 'Content-Type': mp4 ? 'video/mp4' : 'video/quicktime', 'Content-Length': size });
      const rs = fs.createReadStream(outFile);
      rs.pipe(res);
      rs.on('close', () => {
        if (process.env.ANAMORPHIC_KEEP) fs.copyFileSync(outFile, process.env.ANAMORPHIC_KEEP);   // test hook
        cleanup();
      });
    });
    return;
  }

  // Only the tool itself is served – never the server source, repo files or sample assets.
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
  }
  send(res, 404, 'not found');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Anamorphic Logo Maker listening on :${PORT}`);
  if (!hasFfmpeg) console.log('WARNING: ffmpeg not found. Install it (brew install ffmpeg / apk add ffmpeg).');
});
