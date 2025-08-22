document.getElementById("fetchBtn").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/message");
    const data = await res.json();
    document.getElementById("message").textContent = data.message;
  } catch (err) {
    console.error("Error fetching message:", err);
  }
});
