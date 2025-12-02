// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

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

// current scavenger target (for now, global)
let currentItem = getRandomItem();

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
  res.json(currentItem);
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

// TEMP: always false until we add Azure Vision
async function checkImageWithAzure(imagePath, targetLabel) {
  console.log("Stub Vision check:", imagePath, "target:", targetLabel);
  return false; // change later after wiring Azure
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
