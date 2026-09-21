# syntax=docker/dockerfile:1
#
# VereinsFlow – Produktions-Image (mehrstufig).
#
#   docker build --target runner -t vereinsflow .          # die Anwendung (klein, ohne Quellcode und Entwicklungswerkzeuge)
#   docker build --target tools  -t vereinsflow-tools .    # Migrationen und Verwaltungsbefehle (mit Quellcode und Werkzeugen)
#
# Betrieb mit Compose: docker-compose.prod.yml, Anleitung: docs/OPERATIONS.md.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Abhängigkeiten (inkl. Entwicklungsabhängigkeiten: für Build, Migrationen und Werkzeuge) ----------------------
FROM base AS deps
# postinstall führt "prisma generate" aus und braucht deshalb Schema und Konfiguration.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# --- Build ("standalone": ein schlankes Server-Paket) ------------------------------------------------------------
FROM deps AS build
COPY . .
ENV BUILD_STANDALONE=1
# Der Build braucht weder Konfiguration noch Datenbank: Der Datenbank-Client entsteht erst beim ersten Zugriff.
RUN npm run build

# --- Werkzeuge: Migrationen, Plattform-Administrator anlegen (npm run admin:create), Jobs von Hand ------------------
FROM deps AS tools
COPY . .
CMD ["npx", "prisma", "migrate", "deploy"]

# --- Laufzeit ------------------------------------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/storage

# Unprivilegierter Benutzer; nur die Dateiablage ist beschreibbar.
RUN groupadd --system --gid 10001 vereinsflow \
 && useradd --system --uid 10001 --gid vereinsflow --home-dir /app --shell /usr/sbin/nologin vereinsflow \
 && mkdir -p /data/storage \
 && chown -R vereinsflow:vereinsflow /data

COPY --from=build --chown=vereinsflow:vereinsflow /app/.next/standalone ./
COPY --from=build --chown=vereinsflow:vereinsflow /app/.next/static ./.next/static
COPY --from=build --chown=vereinsflow:vereinsflow /app/public ./public

USER vereinsflow
VOLUME ["/data/storage"]
EXPOSE 3000

# Antwortet die Anwendung und erreicht sie die Datenbank? (GET /api/health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Der Start prüft die Konfiguration und verweigert unsichere Produktionswerte (siehe src/instrumentation.ts).
CMD ["node", "server.js"]
