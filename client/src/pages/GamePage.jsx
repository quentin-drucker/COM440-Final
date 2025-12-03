import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import UploadForm from "../components/UploadForm.jsx";

const socket = io("http://localhost:4000");

function GamePage({ user }) {
  const [currentItem, setCurrentItem] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [roundStatus, setRoundStatus] = useState("Loading round...");
  const [roundActive, setRoundActive] = useState(false);
  const [roundKey, setRoundKey] = useState(0); // used to reset UploadForm each round

  async function fetchInitialData() {
    const [itemRes, boardRes] = await Promise.all([
      fetch("http://localhost:4000/api/current-item"),
      fetch("http://localhost:4000/api/leaderboard")
    ]);

    const itemData = await itemRes.json();
    setCurrentItem(itemData.item);
    setRoundStartTime(itemData.startedAt);
    setLeaderboard(await boardRes.json());

    setRoundActive(itemData.active);
    setRoundStatus(itemData.active ? "Round in progress" : "Brief Intermission");
    setRoundKey(itemData.roundId || 1);
  }

  useEffect(() => {
    fetchInitialData();

    socket.on("leaderboardUpdated", (board) => {
      setLeaderboard(board);
    });

    socket.on("roundStarted", (payload) => {
      setCurrentItem(payload.item);
      setRoundStartTime(payload.startedAt);
      setWinnerInfo(null);
      setElapsedSeconds(0);
      setRoundActive(true);
      setRoundStatus("Round in progress");
      setRoundKey(payload.roundId); // IMPORTANT for resetting UploadForm
    });

    socket.on("roundEnded", (payload) => {
      setWinnerInfo({
        winner: payload.winner,
        item: payload.item,
        durationMs: payload.durationMs
      });
      setLeaderboard(payload.leaderboard);
      setRoundActive(false); // round is no longer running

      // freeze timer at the winning time
      if (payload.durationMs) {
        setElapsedSeconds(payload.durationMs / 1000);
      }

      setRoundStatus("Brief Intermission");
    });

    return () => {
      socket.off("leaderboardUpdated");
      socket.off("roundStarted");
      socket.off("roundEnded");
    };
  }, []);

  // simple timer that updates based on roundStartTime
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
