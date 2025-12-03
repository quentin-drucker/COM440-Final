import React, { useState, useEffect, useRef } from "react";

function UploadForm({ username, targetLabel, roundKey }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    // New round started -> clear any previous "You won" message and file
    setMessage("");
    setFile(null);
    // Also clear the actual <input type="file"> so the UI matches state
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [roundKey]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setMessage("Please choose a photo before submitting.");
      return;
    }
    setMessage("Uploading...");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("username", username);
    formData.append("targetLabel", targetLabel);

    try {
      const res = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.reason === "round_not_active") {
        setMessage(
          "This round already finished — wait for the next item!"
        );
      } else if (data.matched) {
        // This client was the winner (server sends winner + time)
        const sec = data.durationMs
          ? (data.durationMs / 1000).toFixed(2)
          : "?";
        setMessage(`Correct! You won this round in ${sec}s 🎉`);
      } else {
        setMessage("Not quite... try another photo.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Upload failed, please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="upload-form">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files[0] || null)}
        required
      />
      <button type="submit">Submit Photo</button>
      {message && <p className="status">{message}</p>}
    </form>
  );
}

export default UploadForm;
