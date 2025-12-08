// ambient.js — animated ambient background gradient (subtle)
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ambient = document.getElementById("ambient");
  if (!ambient) {
    ambient = document.createElement("div");
    ambient.id = "ambient";
    document.body.appendChild(ambient);
  }

  ambient.innerHTML = "";
  ambient.style.position = "fixed";
  ambient.style.inset = "0";
  ambient.style.zIndex = "-1";
  ambient.style.pointerEvents = "none";
  ambient.style.background = "linear-gradient(120deg, #14222e, #2f4653, #6d8b9c)";
  ambient.style.backgroundSize = "300% 300%";
  ambient.style.animation = "bgGradientMove 20s ease infinite";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes bgGradientMove {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;
  document.head.appendChild(style);
})();
