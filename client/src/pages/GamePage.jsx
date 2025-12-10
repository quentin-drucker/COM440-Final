import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import UploadForm from "../components/UploadForm.jsx";

// Create a Socket.io client using the same origin the app was served from.
const socket = io();


function GamePage({ user }) {
  // Current scavenger item (label + hint) for the active round.
  const [currentItem, setCurrentItem] = useState(null);
  // Current leaderboard array from the server.  
  const [leaderboard, setLeaderboard] = useState([]);
  // Start timestamp (ms) of the current round; used to compute live timer.  
  const [roundStartTime, setRoundStartTime] = useState(null);
  // Information about the last completed round (winner, item, duration).  
  const [winnerInfo, setWinnerInfo] = useState(null);
  // Timer value in seconds for the current round.  
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // High-level round description shown in the header ("Round in progress", "Brief Intermission", etc.).  
  const [roundStatus, setRoundStatus] = useState("Loading round...");
  // Indicates whether a round is currently active (accepting submissions).  
  const [roundActive, setRoundActive] = useState(false);
  // Key that changes every round so UploadForm can reset its internal state.  
  const [roundKey, setRoundKey] = useState(0); // used to reset UploadForm each round
  // List of usernames currently online (from Socket.io).  
  const [onlineUsers, setOnlineUsers] = useState([]);
  // Skip vote status: how many votes vs how many players are needed to skip.  
  const [skipStatus, setSkipStatus] = useState({ votes: 0, needed: 0 });

  // Fetch initial game state when the component first mounts:
  // - current round info (item, start time, active flag, roundId)
  // - current leaderboard
  async function fetchInitialData() {
    const [itemRes, boardRes] = await Promise.all([
      fetch("/api/current-item"),
      fetch("/api/leaderboard")
    ]);

    const itemData = await itemRes.json();
    setCurrentItem(itemData.item);
    setRoundStartTime(itemData.startedAt);
    setLeaderboard(await boardRes.json());

    setRoundActive(itemData.active);
    setRoundStatus(itemData.active ? "Round in progress" : "Brief Intermission");
    // Use roundId from server, fallback to 1 if missing.
    setRoundKey(itemData.roundId || 1);
  }

  // Emit a skip vote to the server for the current item.
  // Only allowed if the round is actually active.
  function handleSkipClick() {
    if (!roundActive) return;
    socket.emit("voteSkip");
  }

  // Main Socket.io + initial data effect.
  // Runs once on mount and registers all event handlers.
  useEffect(() => {
    fetchInitialData();

    // Immediately register this user's name with the server for presence / skip voting.
    socket.emit("registerUser", user);
    
    // Receive online user list updates from the server.
    socket.on("onlineUsers", (users) => {
      setOnlineUsers(users);
    });

    // Receive leaderboard changes whenever someone wins.
    socket.on("leaderboardUpdated", (board) => {
      setLeaderboard(board);
    });

    // Server announces a fresh round (new item, timer reset).
    socket.on("roundStarted", (payload) => {
      setCurrentItem(payload.item);
      setRoundStartTime(payload.startedAt);
      setWinnerInfo(null);
      setElapsedSeconds(0);
      setRoundActive(true);
      setRoundStatus("Round in progress");
      // Changing this key forces UploadForm to reset for the new round.
      setRoundKey(payload.roundId);
    });

    // Server announces that the round has ended and who won.
    socket.on("roundEnded", (payload) => {
      setWinnerInfo({
        winner: payload.winner,
        item: payload.item,
        durationMs: payload.durationMs
      });
      setLeaderboard(payload.leaderboard);
      setRoundActive(false); // round is over, no more submissions counted

      // Freeze the timer at the winning time.
      if (payload.durationMs) {
        setElapsedSeconds(payload.durationMs / 1000);
      }

      setRoundStatus("Brief Intermission");
    });

    // Server updates skip voting progress (votes vs needed).
    socket.on("skipStatus", (status) => {
      setSkipStatus(status);
    });

    // Server announces that everyone skipped the item; new round will follow.
    socket.on("roundSkipped", (payload) => {
      setRoundActive(false);
      setWinnerInfo(null);
      setRoundStatus("Item skipped by all players");
    });
    
    // Cleanup all listeners on unmount to avoid duplicate handlers.
    return () => {
      socket.off("leaderboardUpdated");
      socket.off("roundStarted");
      socket.off("roundEnded");
      socket.off("onlineUsers");
      socket.off("skipStatus");
      socket.off("roundSkipped");
    };
  }, []);

  // Live timer effect:
  // As long as the round is active and there is a start time,
  // update elapsedSeconds every 200ms.
  useEffect(() => {
    if (!roundStartTime || !roundActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diffMs = now - roundStartTime;
      setElapsedSeconds(diffMs / 1000);
    }, 200);

    return () => clearInterval(interval);
  }, [roundStartTime, roundActive]);

  return (
    <div className="page game-page">
      <header>
        <h1>Scavenger Hunt: Office Supplies Edition</h1>
        <p>
          Logged in as <strong>{user}</strong>
        </p>
        <p>
          Status: <strong>{roundStatus}</strong>{" "}
          {roundActive && roundStartTime && (
            <>
              — time: <strong>{elapsedSeconds.toFixed(1)}s</strong>
            </>
          )}
        </p>

        {winnerInfo && (
          <p className="winner">
            Last round: <strong>{winnerInfo.winner}</strong> found a{" "}
            <strong>{winnerInfo.item.label}</strong> in{" "}
            <strong>{(winnerInfo.durationMs / 1000).toFixed(2)}s</strong>
          </p>
        )}
      </header>

      {currentItem && (
        <section className="card">
          <h2>Find this item:</h2>
          <p>
            <strong>{currentItem.label}</strong>
          </p>
          <p className="hint">{currentItem.hint}</p>
        </section>
      )}

      <section className="card">
        <h2>Upload your photo</h2>
        {currentItem && (
          <UploadForm
            username={user}
            targetLabel={currentItem.label}
            roundKey={roundKey}
          />
        )}
      </section>

      <section className="card">
        <h2>Don&apos;t like this item?</h2>
        <button
          type="button"
          onClick={handleSkipClick}
          disabled={!roundActive || onlineUsers.length === 0}
        >
          Vote to skip this item
        </button>
        <p>
          Skip votes: <strong>{skipStatus.votes}</strong> /{" "}
          <strong>{skipStatus.needed}</strong>
        </p>
      </section>

      <section className="card">
        <h2>Players Online</h2>
        {onlineUsers.length === 0 ? (
          <p>No one else is online yet.</p>
        ) : (
          <ul>
            {onlineUsers.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Leaderboard</h2>
        <ol>
          {leaderboard.map((entry) => (
            <li key={entry.username}>
              {entry.username}: {entry.score}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default GamePage;
