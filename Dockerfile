# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production server ──
FROM node:20-alpine AS production
WORKDIR /app

# Copy server
COPY server/package*.json ./
RUN npm ci --production
COPY server/src/ ./src/

# Copy built frontend into server's expected location
COPY --from=frontend-build /app/frontend/dist ./frontend-dist/

# sql.js needs wasm file access
RUN mkdir -p data

# The server looks for frontend dist at ../../frontend/dist relative to index.js
# We adjust by symlinking
RUN mkdir -p ../frontend && ln -s /app/frontend-dist ../frontend/dist

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
