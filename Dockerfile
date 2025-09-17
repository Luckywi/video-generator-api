FROM node:18-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs uploads videos audio final final2 final3 final4 pollutant-clips

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]