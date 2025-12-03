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

function startNewRound() {
  currentItem = getRandomItem();
  currentRoundId += 1;
  roundStartTime = Date.now();
  roundActive = true;

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

// This will later call Azure Vision; for now it's a stub.
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const username = req.body.username;
    const targetLabel = req.body.targetLabel;
    const imagePath = req.file.path;

    const isCorrect = await checkImageWithAzure(imagePath, targetLabel);

    if (isCorrect) {
      const board = incrementScore(username);
      currentItem = getRandomItem();

      io.emit("leaderboardUpdated", board);
      io.emit("newTarget", currentItem);

      return res.json({
        success: true,
        matched: true,
        nextItem: currentItem
      });
    } else {
      return res.json({ success: true, matched: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// // TEMP: always false until add Azure Vision
// async function checkImageWithAzure(imagePath, targetLabel) {
//   console.log("Stub Vision check:", imagePath, "target:", targetLabel);
//   return false; // change later after wiring Azure
// }
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

  return !!match;
}


// ----- Socket.io -----
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
