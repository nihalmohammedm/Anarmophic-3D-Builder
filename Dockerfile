FROM node:22-alpine

# ffmpeg builds the ProRes 4444 (alpha) .mov from the rendered PNG frames
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY server.js index.html ./

ENV NODE_ENV=production \
    PORT=8787
EXPOSE 8787

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.js"]
