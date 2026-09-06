# just-a-bot — the Discord bot.
#
# The only service in the estate with no port and no Caddy route: it opens an
# OUTBOUND gateway connection to Discord and binds nothing. So there is no
# health endpoint to curl; "is it up" is answered by the container's state.
#
# It runs from SOURCE under `tsx`, which is a devDependency — so unlike the
# other images this one keeps dev dependencies in the runtime stage. Splitting
# them would mean adding a compile step the project does not have.
#
# @resvg/resvg-js (satori's renderer, for the bot's generated images) is a
# native module; it ships prebuilds, and the toolchain is the fallback.

FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY bots/discord/package.json ./bots/discord/
RUN npm ci

FROM node:24-alpine AS prod
LABEL org.opencontainers.image.title="just-a-bot"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY bots ./bots
# Keep every linux prebuild; delete only what this image can never be. (See the
# note in Ward's Dockerfile for why this is a blacklist and not a whitelist.)
RUN cd node_modules \
 && find . -type d -name prebuilds -exec sh -c \
      'rm -f "$1"/darwin-*.node "$1"/win32-*.node "$1"/android-*.node' _ {} \; || true
ENV NODE_ENV=production
# The bot's credentials are NOT baked in. `bots/discord/.env` is bind-mounted at
# runtime from the host, the same file the deploy pushes today — a token in an
# image layer is a token in every copy of that image.
CMD ["npm", "run", "discord:start"]
