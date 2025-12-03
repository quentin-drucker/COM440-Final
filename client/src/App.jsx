import React, { useState } from "react";
import LoginPage from "./pages/LoginPage.jsx";
import GamePage from "./pages/GamePage.jsx";

function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return <GamePage user={user} />;
}

export default App;
