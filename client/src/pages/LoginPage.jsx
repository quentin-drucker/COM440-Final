import React, { useState } from "react";

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:4000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        setError("Login failed");
        return;
      }

      const data = await res.json();
      onLogin(data.username);
    } catch (err) {
      console.error(err);
      setError("Network error");
    }
  }

  return (
    <div className="page login-page">
      <h1>Office Scavenger Hunt</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Username
          <input
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
