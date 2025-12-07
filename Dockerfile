# Use a lightweight Node image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# -------------------------
# Install dependencies first (better layer caching)
# -------------------------
COPY server/package*.json server/
COPY client/package*.json client/

RUN cd server && npm install
RUN cd client && npm install

# -------------------------
# Copy the source code
# -------------------------
COPY server server/
COPY client client/

# -------------------------
# Build the React client
# -------------------------
RUN cd client && npm run build

# -------------------------
# Environment
# -------------------------
ENV NODE_ENV=production
ENV PORT=4000

# Expose the port the app listens on
EXPOSE 4000

# -------------------------
# Start the server
# -------------------------
CMD ["node", "server/index.js"]
