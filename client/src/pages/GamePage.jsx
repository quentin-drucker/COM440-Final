import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import UploadForm from "../components/UploadForm.jsx";

const socket = io("http://localhost:4000");

function GamePage({ user }) {
  const [currentItem, setCurrentItem] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  async function fetchInitialData() {
    const [itemRes, boardRes] = await Promise.all([
      fetch("http://localhost:4000/api/current-item"),
      fetch("http://localhost:4000/api/leaderboard")
    ]);
    setCurrentItem(await itemRes.json());
    setLeaderboard(await boardRes.json());
  }

  useEffect(() => {
    fetchInitialData();

    socket.on("leaderboardUpdated", (board) => {
      setLeaderboard(board);
    });

    socket.on("newTarget", (item) => {
      setCurrentItem(item);
    });

    return () => {
      socket.off("leaderboardUpdated");
      socket.off("newTarget");
    };
  }, []);

  return (
    <div className="page game-page">
      <header>
        <h1>Office Scavenger Hunt</h1>
        <p>
          Logged in as <strong>{user}</strong>
        </p>
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
          <UploadForm username={user} targetLabel={currentItem.label} />
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
