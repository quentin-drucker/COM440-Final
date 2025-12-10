import React, { useState, useEffect, useRef } from "react";

function UploadForm({ username, targetLabel, roundKey }) {
  // File chosen by the user for upload.
  const [file, setFile] = useState(null);
  // Status message shown to the user (uploading, incorrect, winner, etc.).
  const [message, setMessage] = useState("");
  // Used to manually clear the file input when a new round begins.
  const fileInputRef = useRef(null);

  // Reset the form whenever the roundKey changes.
  // Server increments roundKey each round, ensuring a clean slate for new submissions.
  useEffect(() => {
    setMessage("");
    setFile(null);

    // Clear the visible file input so UI reflects the reset state.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [roundKey]);

  // Sends the selected image to the backend via multipart/form-data.
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
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      // If server reports that the round already ended, ignore the upload.
      if (data.reason === "round_not_active") {
        setMessage(
          "This round already finished — wait for the next item!"
        );
      // If Azure Vision confirmed correctness AND this player won the round.
      } else if (data.matched) {
      const sec = data.durationMs
        ? (data.durationMs / 1000).toFixed(2)
        : "?";

      const confidence =
        typeof data.confidence === "number"
          ? (data.confidence * 100).toFixed(1)
          : null;

      const confidenceText = confidence
        ? ` Your photo was assessed to be correct with ${confidence}% Azure Vision confidence.`
        : "";

      setMessage(
        `Correct! You won this round in ${sec}s 🎉${confidenceText}`
        );
        // Incorrect guess or general feedback from server
        } else {
        setMessage(
          data.message ||
            "Not quite right - try a different photo or angle of the item."
        );
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
