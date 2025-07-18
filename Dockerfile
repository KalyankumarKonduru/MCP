# Development mode - runs meteor directly without building
FROM ubuntu:22.04

# Install Node.js 18 and system dependencies
RUN apt-get update && \
    apt-get install -y curl gnupg2 software-properties-common && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Meteor
RUN curl https://install.meteor.com/ | sh

# Create meteor user
RUN useradd -m -s /bin/bash meteor

# Set working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Set proper ownership
RUN chown -R meteor:meteor /app

# Switch to meteor user
USER meteor

# Add Meteor to PATH
ENV PATH="/home/meteor/.meteor:$PATH"

# Set environment variables
ENV METEOR_ALLOW_SUPERUSER=1
ENV ROOT_URL=http://localhost:3000
ENV PORT=3000

# Install dependencies
RUN meteor npm install

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Start Meteor in development mode (no --production flag)
CMD ["meteor", "run", "--settings", "settings.json", "--port", "3000"]