# Build image for the registry tooling. Nothing is installed on the host:
# `docker compose run --rm validate` (see compose.yaml) runs the same commands
# CI runs, inside this image.
FROM node:24-slim

# The build reads `git log` for per-predicate dates and the immutability check
# diffs against a base ref, so git is part of the toolchain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory /app

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
ENV PATH=/app/node_modules/.bin:$PATH

# The repository is bind-mounted over /app at run time; node_modules from the
# image is kept by the anonymous volume in compose.yaml.
CMD ["npm", "run", "check"]
