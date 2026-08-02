# syntax=docker/dockerfile:1

# --- Build the React SPA into PocketBase's pb_public ---
FROM node:22-alpine AS frontend

WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Override Vite outDir so we don't depend on a sibling backend/ path in the image.
RUN npx tsc -b && npx vite build --outDir=/pb_public --emptyOutDir

# --- PocketBase runtime (API + SPA + migrations + hooks) ---
FROM alpine:3.21

ARG PB_VERSION=0.39.10
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip

ADD "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ \
  && chmod +x /pb/pocketbase \
  && rm /tmp/pb.zip \
  && apk del unzip

COPY backend/pb_hooks /pb/pb_hooks
COPY backend/pb_migrations /pb/pb_migrations
COPY backend/schema.json /pb/schema.json
COPY --from=frontend /pb_public /pb/pb_public
COPY docker-entrypoint.sh /pb/docker-entrypoint.sh

RUN chmod +x /pb/docker-entrypoint.sh

WORKDIR /pb
EXPOSE 8090
VOLUME ["/pb/pb_data"]

ENTRYPOINT ["/pb/docker-entrypoint.sh"]
