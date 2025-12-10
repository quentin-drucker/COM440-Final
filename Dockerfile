# Use a Node image to build both the React client and run the Express server
FROM node:18

# Create and set the working directory inside the container
WORKDIR /app

# Copy dependency manifests first for efficient Docker layer caching
COPY package*.json ./

# Install server dependencies
RUN npm install

# Copy the entire project (both server and client code)
COPY . .

# Build the React client so production-ready assets are placed in client/dist
WORKDIR /app/client
RUN npm install
RUN npm run build

# Move back to server directory so "node index.js" will run from the backend folder
WORKDIR /app/server

# Expose the backend port (Express + Socket.io)
EXPOSE 4000

# Default command: start the Node server (serves backend API + built React client)
CMD ["node", "index.js"]
