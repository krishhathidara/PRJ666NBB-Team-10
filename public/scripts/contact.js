// public/scripts/contact.js
// Handles Contact Us form submission and UI state

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const nameInput = document.getElementById("contactName");
  const emailInput = document.getElementById("contactEmail");
  const subjectInput = document.getElementById("contactSubject");
  const messageInput = document.getElementById("contactMessage");
  const statusEl = document.getElementById("contactStatus");
  const submitBtn = document.getElementById("contactSubmit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();

    // Simple client-side validation
    if (!name || !email || !subject || !message) {
      setStatus("Please fill in all fields.", "error");
      return;
    }
    if (!email.includes("@")) {
      setStatus("Please enter a valid email address.", "error");
      return;
    }

    setStatus("Sending your message…", "info");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, subject, message })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const msg =
          (data &&
            data.details &&
            data.details[0] &&
            data.details[0].message) ||
          data.error ||
          "Failed to send message.";
        setStatus(msg, "error");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const ticketIdText = data.ticketId
        ? ` Your ticket ID is ${data.ticketId}.`
        : "";
      setStatus(
        "Message sent! Check your email for confirmation." + ticketIdText,
        "success"
      );

      form.reset();
      if (submitBtn) submitBtn.disabled = false;
    } catch (err) {
      console.error("[contact] submit error", err);
      setStatus("Something went wrong. Please try again later.", "error");
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("success", "error", "info");
    if (type) statusEl.classList.add(type);
  }
});
