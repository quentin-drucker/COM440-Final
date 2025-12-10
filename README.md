---
# COM440 Final Project - Real-Time Multiplayer Scavenger Hunt

### A Docker-deployed Azure AI Vision game built with Node, Express, Socket.io, React, and Vite.
---

# Quick Project Overview

This project implements a real-time multiplayer scavenger hunt game in which all players receive the same randomly selected item (like "Pen," "Notebook," "Scissors," etc.) and must physically locate it, photograph it, and upload the image. The backend server uses Azure AI Vision to evaluate each uploaded photo and determine whether it contains the target item with sufficient confidence. The first correct submission instantly wins the round and awards one point on a persistent leaderboard.

The full system includes:
- Real-time gameplay via Socket.io
- Automatic round lifecycle management
- Password-protected login page
- A skip-vote system requiring unanimous agreement
- Persistent leaderboard stored in JSON
- A fully containerized Docker deployment running continuously on an Azure VM
- A React frontend (Vite) served by the Express backend in production
- Azure AI Vision (Tags endpoint) for correctness assessment

### Note:
The repository includes an `item-sample-images/` folder containing pre-selected images of all items in the item pool. These images allow testers to validate functionality without physically scavenging items.

---

# Running the Application (Local Development)
## 1. Clone the repository
```bash
git clone https://github.com/quentin-drucker/COM440-Final.git
```
Then: 
```bash
cd COM440-Final
```

## 2. Create the environment file
Inside `server/`, create a new file named `.env` with:

- Port = 4000
- App password = pwd123
- Azure Vision endpoint 
- Azure Vision API key

## 3. Install dependencies
Navigate to both server and client folders.
```bash
npm install
```
(run twice, separately, once in /server and once in /client)

## 4. Start the server
```bash
node index.js
```

## 5. Start the React client
Inside `client/`
```bash
npm run dev
```
**Where it runs:**
Client → `http://localhost:5173`

Server → `http://localhost:4000`

---

# Deploying on Azure VM (Docker)
These are the steps I used to run the game persistently on an Azure VM.

## 1. SSH into your VM
```bash
ssh azureuser@<VM_PUBLIC_IP>
```

## 2. Install Docker and Git
```bash
sudo apt-get update
sudo apt-get install -y docker.io git
```

## 3. Clone the repo onto your VM
```bash
git clone https://github.com/quentin-drucker/COM440-Final.git
```

## 4. Add the `server/.env` file
```bash
nano server/.env
```
Paste your keys, save (ctrl+O), exit (ctrl+X).

## 5. Build the Docker image
```bash
sudo docker build -t scavenger-hunt .
```

## 6. Run the container indefinitely
(detached, auto-restart):
```bash
sudo docker run -d --name scavenger-hunt --restart always --env-file server/.env -p 4000:4000 scavenger-hunt
```

## 7. Open port 4000 on Azure
Azure Portal → VM → Networking → Add inbound rule for port 4000.

## 8. Access the live game
Open in browser:
`http://<VM_PUBLIC_IP>:4000/`

---

# Project Structure (High-Level)
This project contains both the React client and the Node/Express backend. The most important files are listed below.

### client/src/pages/LoginPage.jsx
Handles username + password authentication. Sends a POST request to `/api/login` and transitions into the game page on success.

### client/src/pages/GamePage.jsx
Core frontend logic. Connects to Socket.io, listens for round events, updates the leaderboard, displays the timer, handles skip-votes, shows round results, and renders the upload interface.

### client/src/components/UploadForm.jsx
Handles image uploading using FormData, displays messages like "Correct!" or "Try again", and resets itself at the start of each round via the `roundKey` prop.

### server/index.js
- This is the heart of the system. It handles:
- Express routing
- Serving the production React build
- AI Vision photo verification
- Round lifecycle control (start, win, skip, intermission)
- Leaderboard persistence
- Skip-vote management
- Real-time events via Socket.io

### server/items.js
Contains the predefined item pool used for random selection. I removed "tape" after testing because AI Vision performed poorly detecting it.

### Dockerfile
Builds the production client, copies it into the server container, and runs everything behind one Express server.

---

# In-Depth Explanation (Developer Narrative)
The remainder of this README is written from my point of view as the developer. This is where I explain how the system works internally, why I designed it the way I did, and how the frontend, backend, sockets, Docker, and Azure Vision integrate to form a cohesive multiplayer game.

## My Goals and Approach
My goal was to design a system where:
- Every player sees the same item at the same time.
- The system reacts immediately when someone submits a photo.
- Azure Vision determines correctness, not the players.
- The game cycles automatically with no manual intervention on the server.
- The entire app runs continuously inside Docker, so the VM never needs SSH interaction to restart it.
To achieve this, I broke the project into three main parts:
1. Frontend (React/Vite) - handles UI, socket events, uploads.
2. Backend (Node/Express + Socket.io) - authoritative game controller.
3. Azure AI Vision - evaluates image correctness.
Everything else supports these pieces.

## How the Game Works Internally
### 1. Round Lifecycle
The server manages the entire timing and state of the game. When it boots:
- It immediately calls `startNewRound()`.
- It chooses a random item from `items.js`.
- It resets skip votes.
- It records the start time.
- It broadcasts `roundStarted` to all connected clients.
From here, the game enters a simple loop:

#### A player wins:
- They upload an image → server sends it to Azure Vision → Vision responds with tags + confidence.
- If Vision reports a strong enough match (>= 0.6 confidence), the server declares that player the winner.
- All clients receive `roundEnded`.
- After a 10-second intermission, `startNewRound()` triggers again automatically.

#### All players skip:
If every online user votes to skip, the server broadcasts roundSkipped.
After ~3 seconds, `startNewRound()` fires again.

#### No players online:
A subtle feature in my backend is that if all players leave mid-round, the timer essentially "pauses," because when the next player connects, the backend resets `roundStartTime`. This makes the timer fair and intuitive.

### 2. Photo Upload + Azure Vision Process
UploadForm sends an image to `/api/upload` using FormData.
The server:
1. Saves the temporary file via multer.
2. Reads it into memory.
3. Sends the binary data to Azure Vision’s Tags endpoint.
4. Retrieves an array of detected labels + confidences.
5. Performs a fuzzy match against the target item.
6. Deletes the uploaded file.
If the photo is correct and the round is still active, the server locks the round by setting `roundActive = false` and declares the winner.

I tuned the matching rules to allow forgiving matches such as "paperclip" vs "paper clip" and pluralizations.

### 3. Leaderboard Persistence
The leaderboard is stored in `server/leaderboard.json`. I intentionally used file-based storage rather than a database because:
- It was sufficient for my current project scope/specifications
- It avoids additional infrastructure setup
- It persists automatically across container restarts
Whenever someone wins, their score increments and the JSON file is rewritten.

### 4. Real-Time Multiplayer Behavior
Socket.io was crucial because it enabled:
- Synchronized round starts
- Timers updating live on every client
- Instant winner announcements
- Dynamic online user management
- Skip-vote tracking in real time
Every time a client connects, it registers with its username. The server keeps a mapping of socket IDs to usernames and recalculates the skip vote requirements dynamically.

### 5. Skip-Vote Implementation
Each username may vote once per round. The server stores votes in a Set.
When the number of votes equals the number of online users, the round is skipped. (If players mutually agree to get a new item for whatever the reason may be)

This design guarantees fairness because:
- A single player cannot force a skip.
- A player cannot vote twice.
- The skip threshold adjusts as people join or leave.

### 6. Docker + Azure VM Deployment
I used Docker in detached mode with the `--restart always` flag. (so it "runs forever") This ensures:
- Automatic restart if the VM reboots
- Automatic restart if the container crashes
- No SSH intervention required
The Dockerfile builds the React client, embeds it into the server runtime, and exposes a single server on port 4000 for both API calls and the UI.

Once deployed, visiting `<VM_PUBLIC_IP>:4000` loads the production client, which then communicates with the backend via REST and sockets.

---

# Future Improvements
If I extended this project, I would consider adding:
- A chat sidebar
- More item sets or themed game modes
- A lightweight database like SQLite
- Sound effects + animations
- Admin controls for custom item sets
---

# Final Notes
This README is intentionally structured to provide both a quick high-level overview (useful for anyone scanning the repository) and a deeper behind-the-scenes explanation of how the system works from my perspective as the developer. The game runs fully automatically once deployed, with Azure Vision determining correctness and the server orchestrating all player interactions, round transitions, skip voting, leaderboard management, and real-time synchronization.