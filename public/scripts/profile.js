// /public/scripts/profile.js
(async function () {
  try {
    const sessionRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!sessionRes.ok) return (location.href = "/auth/signin.html");
    const me = await sessionRes.json();
    if (!me?.email) return (location.href = "/auth/signin.html");

    const dbRes = await fetch(`/api/users?email=${encodeURIComponent(me.email)}`);
    const userData = await dbRes.json();
    const profile = dbRes.ok ? userData : me;

    const nameEl = document.getElementById("name");
    const emailEl = document.getElementById("email");
    const favEl = document.getElementById("favStoreText");
    const avatarEl = document.getElementById("profile-avatar");

    nameEl.textContent = profile.name || "—";
    emailEl.textContent = profile.email || "—";
    if (favEl) favEl.textContent = profile.favStore || "—";
    if (avatarEl) avatarEl.src = profile.avatar || "/assets/profile.png";

    // Avatar
    const changeBtn = document.getElementById("changeAvatarBtn");
    const inputEl = document.getElementById("avatarInput");
    if (changeBtn && inputEl) {
      changeBtn.addEventListener("click", () => inputEl.click());
      inputEl.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result;
          const resp = await fetch("/api/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: me.email, field: "avatar", value: base64 }),
          });
          if (resp.ok) {
            avatarEl.src = base64;
            alert("✅ Avatar updated successfully!");
          } else {
            alert("❌ Failed to update avatar");
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // ====== Edit Profile Logic ======
    const editBtn = document.getElementById("editProfileBtn");
    const form = document.getElementById("editProfileForm");
    const saveBtn = document.getElementById("saveProfileBtn");
    const cancelBtn = document.getElementById("cancelEditBtn");
    const nameInput = document.getElementById("editName");
    const storeSelect = document.getElementById("editFavStore");

    editBtn.onclick = () => {
      form.style.display = "flex";
      editBtn.style.display = "none";
      nameInput.value = profile.name || "";
      storeSelect.value = profile.favStore || "";
    };

    cancelBtn.onclick = () => {
      form.style.display = "none";
      editBtn.style.display = "inline-block";
    };

    saveBtn.onclick = async () => {
     const newName = nameInput.value.trim();
const newEmail = document.getElementById("editEmail").value.trim();
const newStore = storeSelect.value.trim();

if (!newEmail || !newEmail.includes("@")) {
  alert("Please enter a valid email address.");
  return;
}

const resp = await fetch("/api/users", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: me.email, // old email for lookup
    field: "profile",
    value: { name: newName, favStore: newStore, email: newEmail },
  }),
});


      const data = await resp.json();
     if (resp.ok && data.success) {
  nameEl.textContent = newName;
  emailEl.textContent = newEmail;
  if (favEl) favEl.textContent = newStore;
  alert("✅ Profile updated successfully!");
  form.style.display = "none";
  editBtn.style.display = "inline-block";
}
 else {
        alert("❌ Failed to update profile.");
      }
    };
  } catch (err) {
    console.error("Profile load error:", err);
    location.href = "/auth/signin.html";
  }
})();
