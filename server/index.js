// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const fetch = require("node-fetch");

const { ITEMS, getRandomItem } = require("./items");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 4000;

// ----- Middleware -----
app.use(cors());
app.use(express.json());
// ----------------------------
// Serve the React build folder
// ----------------------------
const clientBuildPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientBuildPath));

// ----- Leaderboard helpers -----
const LEADERBOARD_PATH = path.join(__dirname, "leaderboard.json");

function readLeaderboard() {
  if (!fs.existsSync(LEADERBOARD_PATH)) return [];
  const raw = fs.readFileSync(LEADERBOARD_PATH, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

function writeLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(data, null, 2));
}

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

// current scavenger target + round state
let currentItem = null;
let currentRoundId = 0;
let roundStartTime = null; // ms timestamp
let roundActive = false;

// track which users are currently online (socket.id -> username)
const onlineUsers = new Map();

// users who have voted to skip the current item (by username)
const skipVotes = new Set();

let lastOnlineCount = 0;
function broadcastOnlineUsers() {
  const users = Array.from(new Set(onlineUsers.values()));
  io.emit("onlineUsers", users);
  // also broadcast current skip status
    io.emit("skipStatus", {
      votes: skipVotes.size,
      needed: users.length
    });

  const newCount = users.length;
  // Timer reset logic   (If we just went from 0 players online -> at least 1 player online, reset the round's start time so the timer effectively "starts" when someone is actually here.)
  if (lastOnlineCount === 0 && newCount > 0) {
    if (roundActive) {
      roundStartTime = Date.now();
      console.log("First player joined, resetting roundStartTime");
    }
  }

  lastOnlineCount = newCount;
}



function startNewRound() {
  currentItem = getRandomItem();
  currentRoundId += 1;
  roundStartTime = Date.now();
  roundActive = true;
  skipVotes.clear(); // reset skip votes for the new item

  // reset the skip status for all clients
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

// Simple password login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ username });
});

app.get("/api/current-item", (req, res) => {
  res.json({
    item: currentItem,
    roundId: currentRoundId,
    startedAt: roundStartTime,
    active: roundActive
  });
});


app.get("/api/leaderboard", (req, res) => {
  const board = readLeaderboard();
  board.sort((a, b) => b.score - a.score);
  res.json(board);
});

// ----- File upload (images) -----
const upload = multer({
  dest: path.join(__dirname, "uploads")
});

// This will later call Azure Vision resource (to check user's uploaded image of current item)
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

    // If round is not active, don't let anyone win
    if (!roundActive) {
      return res.json({
        success: true,
        matched: false,
        reason: "round_not_active"
      });
    }

    const { isCorrect, confidence } = await checkImageWithAzure(
      imagePath,
      targetLabel
    );

    // delete uploaded file immediately after analysis
    fs.unlink(imagePath, (err) => {
      if (err) console.error("⚠️ Failed to delete uploaded file:", err);
    });

    // if incorrect guess, round still going
    if (!isCorrect) {
      return res.json({
        success: true,
        matched: false,
        confidence,
        message: `Not quite right - try a different photo, or angle of it. Azure AI Vision's isn't confident that your uploaded item matches ${targetLabel}.`
      });
    }

    // If we reach here, we got a correct answer while roundActive === true.
    // This player wins the round.
    roundActive = false;
    const endTime = Date.now();
    const durationMs = endTime - roundStartTime;

    const board = incrementScore(username);

    // Update all clients' leaderboard
    io.emit("leaderboardUpdated", board);

    // Announce the winner of this round
    io.emit("roundEnded", {
      winner: username,
      item: currentItem,
      durationMs,
      leaderboard: board,
      roundId: currentRoundId
    });

    // Start a new round after a short intermission (10 seconds)
    setTimeout(() => {
      console.log("10s intermission over, starting new round");
      startNewRound();
    }, 10000); // 10,000 ms = 10 sec


    return res.json({
      success: true,
      matched: true,
      winner: username,
      confidence, //send CV confidence info to client
      durationMs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});


async function checkImageWithAzure(imagePath, targetLabel) {
  const endpoint = (process.env.AZURE_VISION_ENDPOINT || "").replace(/\/+$/, "");
  const key = process.env.AZURE_VISION_KEY;

  if (!endpoint || !key) {
    console.error("Azure Vision not configured (endpoint/key missing)");
    return false;
  }

  // Using Computer Vision v3.2 "analyze" endpoint with Tags
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

  // simple fuzzy match: exact or substring, with a confidence threshold
  const match = data.tags.find((tag) => {
    const name = tag.name.toLowerCase();
    const conf = tag.confidence;
    return (
      conf >= 0.6 && // can tweak this
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
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Client tells us which username this socket belongs to
  socket.on("registerUser", (username) => {
    onlineUsers.set(socket.id, username);
    broadcastOnlineUsers();
  });

  socket.on("voteSkip", () => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    // track that this user voted to skip
    skipVotes.add(username);

    const users = Array.from(new Set(onlineUsers.values()));
    const votes = skipVotes.size;
    const needed = users.length;

    // broadcast updated skip progress to everyone
    io.emit("skipStatus", { votes, needed });

    // if everyone online has voted to skip, and round is active, skip the item
    if (roundActive && needed > 0 && votes >= needed) {
      console.log("All players voted to skip, starting new round");
      roundActive = false;

      // announce the skip, as a brief status message
      io.emit("roundSkipped", {
        item: currentItem,
        roundId: currentRoundId
      });

      // Give clients ~3 seconds to read "Item skipped..." before new round
      setTimeout(() => {
        startNewRound();
      }, 3000);
    }
  });

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
  // don't break your API routes
  if (req.path.startsWith("/api")) {
    return res.status(404).end();
  }
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  startNewRound(); // start the first round when server boots
});
