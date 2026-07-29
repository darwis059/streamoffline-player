# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first for better caching
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy the rest of the frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve via FastAPI and install dependencies
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies (ffmpeg is required for yt-dlp audio conversion and loudnorm filter)
# nodejs is required by yt-dlp as a fallback for YouTube's JavaScript bot challenges (EJS)
# curl and unzip are required to install Deno
RUN apt-get update && apt-get install -y \
    ffmpeg \
    nodejs \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno for EJS solving (recommended by yt-dlp). 
# It will silently fail on unsupported architectures like armv7, where it will seamlessly fall back to nodejs.
RUN curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh || true

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy the compiled React frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the port the app runs on
EXPOSE 8000

# Environment variable to toggle yt-dlp debug logs
ENV YT_DLP_VERBOSE=false

# Command to run the FastAPI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
