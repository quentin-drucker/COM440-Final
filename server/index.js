// server/index.js

// Core dependencies for HTTP server, REST API, websockets, file handling, and Azure Vision calls

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const fetch = require("node-fetch");

// Local module with the scavenger item pool and random selection helper
const { ITEMS, getRandomItem } = require("./items");

// Load environment variables from .env (port, app password, Azure Vision settings, etc.)
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // allow any origin (clients connect from browser / VM IP)
});

const PORT = process.env.PORT || 4000;

// ----- Middleware -----
app.use(cors());            // enable CORS for all routes
app.use(express.json());    // parse JSON bodies on incoming requests

// ----------------------------
// Serve the React build folder
// ----------------------------
// In production, the built React app lives in client/dist and is served as static assets.
const clientBuildPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientBuildPath));

// ----- Leaderboard helpers -----
const LEADERBOARD_PATH = path.join(__dirname, "leaderboard.json");

// Read leaderboard from disk; returns empty array if file does not exist yet.
function readLeaderboard() {
  if (!fs.existsSync(LEADERBOARD_PATH)) return [];
  const raw = fs.readFileSync(LEADERBOARD_PATH, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

// Persist the current leaderboard array to disk.
function writeLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(data, null, 2));
}

// Increment a user's score and return the updated leaderboard.
// Creates a new entry if the username has not been seen before.
function incrementScore(username) {
  const board = readLeaderboard();
  let entry = board.find((u) => u.username === username);
  if (!entry) {
    entry = { username, score: 0 };
    board.push(entry);
  }
  entry.score += 1;
  writeLeaderboard(board);
  return board;
}

// Current scavenger target + round state
let currentItem = null;
let currentRoundId = 0;
let roundStartTime = null; // ms timestamp
let roundActive = false;

// Track which users are currently online (socket.id -> username)
const onlineUsers = new Map();

// Usernames who have voted to skip the current item
const skipVotes = new Set();


let lastOnlineCount = 0;

// Broadcasts current online user list and skip status to all clients.
// Also handles "timer reset" behavior when the first player joins.
function broadcastOnlineUsers() {
  const users = Array.from(new Set(onlineUsers.values()));
  io.emit("onlineUsers", users);
  // also broadcast current skip status
    io.emit("skipStatus", {
      votes: skipVotes.size,
      needed: users.length
    });

  const newCount = users.length;
  // Timer reset logic:
  // If the online count transitions from 0 -> >0, reset the round's start time
  // so the timer effectively starts when at least one player is present.
  if (lastOnlineCount === 0 && newCount > 0) {
    if (roundActive) {
      roundStartTime = Date.now();
      console.log("First player joined, resetting roundStartTime");
    }
  }

  lastOnlineCount = newCount;
}


// Starts a new round:
// - Picks a random item
// - Resets round state and skip votes
// - Broadcasts "roundStarted" and updated skip status to all clients
function startNewRound() {
  currentItem = getRandomItem();
  currentRoundId += 1;
  roundStartTime = Date.now();
  roundActive = true;
  skipVotes.clear(); // reset skip votes for the new item

  // Reset the skip status for all clients
  const users = Array.from(new Set(onlineUsers.values()));
  io.emit("skipStatus", {
    votes: skipVotes.size, // 0 after clear()
    needed: users.length
  });

  const payload = {
    item: currentItem,
    roundId: currentRoundId,
    startedAt: roundStartTime
  };

  console.log("Starting new round:", payload);
  io.emit("roundStarted", payload);
}


// ----- Routes -----

// Simple password login endpoint.
// Verifies shared app password and echoes back the username if valid.
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ username });
});

// Expose current round information so new clients can sync state on page load.
app.get("/api/current-item", (req, res) => {
  res.json({
    item: currentItem,
    roundId: currentRoundId,
    startedAt: roundStartTime,
    active: roundActive
  });
});

// Return the current leaderboard sorted by score (highest first).
app.get("/api/leaderboard", (req, res) => {
  const board = readLeaderboard();
  board.sort((a, b) => b.score - a.score);
  res.json(board);
});

// ----- File upload (images) -----
// Multer temp upload directory for incoming photos.
const upload = multer({
  dest: path.join(__dirname, "uploads")
});

// Main upload route:
// Receives the user's photo, sends it to Azure Vision, and resolves whether it matches the target item.
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const username = req.body.username;
    const targetLabel = req.body.targetLabel;
    const imagePath = req.file.path;

    console.log("Upload from", username, {
      targetLabel,
      roundActive,
      currentRoundId
    });

    // If round is not active, ignore the upload for scoring purposes.
    if (!roundActive) {
      return res.json({
        success: true,
        matched: false,
        reason: "round_not_active"
      });
    }

    // Analyze the uploaded image with Azure Vision
    const { isCorrect, confidence } = await checkImageWithAzure(
      imagePath,
      targetLabel
    );

    // Delete uploaded file immediately after analysis (cleanup)
    fs.unlink(imagePath, (err) => {
      if (err) console.error("Failed to delete uploaded file:", err);
    });

    // If incorrect guess, keep the round running and send feedback.
    if (!isCorrect) {
      return res.json({
        success: true,
        matched: false,
        confidence,
        message: `Not quite right - try a different photo, or angle of it. Azure AI Vision's isn't confident that your uploaded item matches ${targetLabel}.`
      });
    }

    // If correct and round is still active, this player wins.    
    roundActive = false;
    const endTime = Date.now();
    const durationMs = endTime - roundStartTime;

    // Update leaderboard and broadcast new scores.
    const board = incrementScore(username);

    // Update all clients' leaderboard
    io.emit("leaderboardUpdated", board);

    // Announce the winner and round results to all connected clients.
    io.emit("roundEnded", {
      winner: username,
      item: currentItem,
      durationMs,
      leaderboard: board,
      roundId: currentRoundId
    });

    // Start a new round after a short intermission (~10 seconds),
    // giving players time to see who won and what the item was.
    setTimeout(() => {
      console.log("10s intermission over, starting new round");
      startNewRound();
    }, 10000); // 10,000 ms = 10 sec

    // Response back to the winner who triggered this upload.
    return res.json({
      success: true,
      matched: true,
      winner: username,
      confidence, //send Azure AI Vision (CV) confidence info to client
      durationMs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Call Azure Computer Vision's "analyze" endpoint with Tags to detect objects in the image.
// Returns { isCorrect, confidence } based on fuzzy matching against targetLabel.
async function checkImageWithAzure(imagePath, targetLabel) {
  const endpoint = (process.env.AZURE_VISION_ENDPOINT || "").replace(/\/+$/, "");
  const key = process.env.AZURE_VISION_KEY;

  if (!endpoint || !key) {
    console.error("Azure Vision not configured (endpoint/key missing)");
    return false;
  }

  // Using Computer Vision "analyze" endpoint with Tags
  const url = `${endpoint}/vision/v3.2/analyze?visualFeatures=Tags`;

  const imageData = fs.readFileSync(imagePath);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/octet-stream"
      },
      body: imageData
    });
  } catch (err) {
    console.error("Error calling Azure Vision:", err);
    return false;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error("Azure Vision HTTP error:", res.status, text);
    return false;
  }

  const data = await res.json();

  // data.tags looks like: [{ name: "stapler", confidence: 0.93 }, ...]
  const lowerTarget = targetLabel.toLowerCase();

  console.log("Azure Vision tags:", data.tags);

  // Simple "fuzzy" match:
  // - Minimum confidence threshold (0.6)
  // - Tag name and target label can match exactly or via substring in either direction.
  const match = data.tags.find((tag) => {
    const name = tag.name.toLowerCase();
    const conf = tag.confidence;
    return (
      conf >= 0.6 && // (can tweak this but this value seems forgiving and works for now)
      (name === lowerTarget ||
        name.includes(lowerTarget) ||
        lowerTarget.includes(name))
    );
  });

  console.log("Matched target?", !!match, "for label", targetLabel);

  return {
  isCorrect: !!match,
  confidence: match ? match.confidence : 0
};
}

// ----- Socket.io -----
// Real-time connection handler for each browser client.
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Client tells the server which username this socket belongs to.
  socket.on("registerUser", (username) => {
    onlineUsers.set(socket.id, username);
    broadcastOnlineUsers();
  });

  // Handle a user's vote to skip the current item.
  socket.on("voteSkip", () => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    // Track that this user voted to skip (one vote per username).
    skipVotes.add(username);

    const users = Array.from(new Set(onlineUsers.values()));
    const votes = skipVotes.size;
    const needed = users.length;

    // Broadcast updated skip progress to everyone.
    io.emit("skipStatus", { votes, needed });

    // If all online users have voted to skip and the round is active, skip the item.
    if (roundActive && needed > 0 && votes >= needed) {
      console.log("All players voted to skip, starting new round");
      roundActive = false;

      // Announce the skip, as a brief status message.
      io.emit("roundSkipped", {
        item: currentItem,
        roundId: currentRoundId
      });

      // Give clients ~3 seconds to read "Item skipped..." before new round starts.
      setTimeout(() => {
        startNewRound();
      }, 3000);
    }
  });

  // Clean up user mapping on disconnect and update everyone with the new online list.
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

// -------------------------------------------------------
// Fallback: send React's index.html for any unknown route
// -------------------------------------------------------
app.get("*", (req, res) => {
  // Don't override API endpoints with the React app.
  if (req.path.startsWith("/api")) {
    return res.status(404).end();
  }
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Start the HTTP + Socket.io server and immediately start the first round.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  startNewRound(); // start the first round when server boots
});
