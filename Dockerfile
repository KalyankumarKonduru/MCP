cd mcp-pilot-meteor

# 1. Clean up the failed container
docker rm meteor-test

# 2. Build Meteor locally (this will work since you can run meteor locally)
meteor build ../meteor-build --directory

# 3. Create the runtime Dockerfile
cat > Dockerfile.runtime << 'EOF'
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy the pre-built Meteor bundle
COPY ../meteor-build/bundle/ .

# Copy settings.json
COPY settings.json .

# Install production Node.js dependencies
RUN cd programs/server && npm install --production

# Create non-root user
RUN addgroup -g 1001 -S meteor && \
    adduser -S meteor -u 1001 -G meteor && \
    chown -R meteor:meteor /app

USER meteor

# Set environment variables
ENV ROOT_URL=http://localhost:3000
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Start the Node.js application
CMD ["node", "main.js", "--settings", "settings.json"]
EOF

# 4. Build the runtime image
docker build -f Dockerfile.runtime -t mcp-pilot-meteor-runtime .