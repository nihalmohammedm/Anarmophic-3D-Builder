# Anamorphic Logo Maker

Upload an SVG logo, extrude it into a solid 3D shape, animate it (loop / reveal / entrance / exit) and export a
transparent ProRes 4444 `.mov`.

## Run locally

```
node server.js          # http://localhost:8787  (needs ffmpeg: brew install ffmpeg)
```

## Deploy on Dokploy

1. Push this folder to a Git repo (GitHub/GitLab/Gitea).
2. Dokploy → **Create Application** → Provider: Git → pick the repo/branch.
3. **Build Type: Dockerfile** (path `./Dockerfile`).
4. **Domains** → add your domain, **container port `8787`**, HTTPS on (Let's Encrypt).
5. **Environment** (recommended on a public domain — exports use server CPU):
   ```
   BASIC_AUTH_USER=your-user
   BASIC_AUTH_PASS=a-long-password
   ```
   Optional: `MAX_FRAMES` (1800), `MAX_FRAME_MB` (40), `MAX_CONCURRENT` (2).
6. Deploy. Health check endpoint: `/health`.

Give the container at least 1 GB RAM (2 GB if you export 4K). Frames are written to the container's temp dir
and deleted after each export, so no volume is needed.
