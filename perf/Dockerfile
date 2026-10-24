# Load-test runner: k6 plus a small control API (server.mjs) the admin uses through the backend.
FROM grafana/k6:1.3.0 AS k6

FROM node:22-alpine
COPY --from=k6 /usr/bin/k6 /usr/bin/k6
WORKDIR /runner
COPY runner/server.mjs ./server.mjs
COPY k6 ./k6
# runs/ is a volume; owning it here makes Docker create the volume writable for the node user
RUN mkdir -p /runner/runs && chown node:node /runner/runs
USER node
EXPOSE 9930
CMD ["node", "server.mjs"]
