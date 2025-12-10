import React, { useState } from "react";

function LoginPage({ onLogin }) {
  // Local form state for username, password, and error feedback.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Handles submission of login credentials.
  // Calls the server's /api/login endpoint and, on success,
  // hands the authenticated username back to the parent (App).
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      // Server rejects invalid credentials with a non-OK status.
      if (!res.ok) {
        setError("Login failed");
        return;
      }

      // Extract the username echoed back from the server
      // and notify the parent component that login succeeded.
      const data = await res.json();
      onLogin(data.username);
    } catch (err) {
      console.error(err);
      setError("Network error"); // covers connection/server issues
    }
  }

  return (
    <div className="page login-page">
      <h1>Scavenger Hunt: Office Supplies Edition</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit">Enter</button>
      </form>
    </div>
  );
}

export default LoginPage;
