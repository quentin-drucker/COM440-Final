import React, { useState } from "react";

function UploadForm({ username, targetLabel }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

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

      if (data.matched) {
        setMessage("Correct! New item selected 🎉");
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
