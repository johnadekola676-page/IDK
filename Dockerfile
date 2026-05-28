# Use Alpine-based Node.js for smaller image size
FROM node:22-alpine

# Install only essential build tools for better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Initialize database
RUN npm run init-db

# Create necessary directories
RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault

# Expose health check port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
