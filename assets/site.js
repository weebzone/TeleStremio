// TeleStremio site: palette switcher (page + screenshots), screen tabs, OS detection,
// copy buttons, mobile menu and the guide's table of contents. No dependencies.
(() => {
  const root = document.documentElement;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ── palette ──────────────────────────────────────────────────────────────
  const systemPalette = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "ink" : "paper");
  let palette = store.get("palette") || systemPalette();

  function swapShots() {
    document.querySelectorAll("img[data-shot]").forEach((img) => {
      const next = `shots/${palette}-${img.dataset.shot}.webp`;
      if (img.getAttribute("src") === next) return;
      img.classList.add("out");
      const pre = new Image();
      pre.onload = pre.onerror = () => { img.src = next; requestAnimationFrame(() => img.classList.remove("out")); };
      pre.src = next;
    });
  }

  function applyPalette(p, save) {
    palette = p;
    root.dataset.palette = p;
    document.querySelectorAll(".palette button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
    if (save) store.set("palette", p);
    swapShots();
  }
  document.querySelectorAll(".palette button").forEach((b) => b.addEventListener("click", () => applyPalette(b.dataset.p, true)));
  applyPalette(palette, false);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!store.get("palette")) applyPalette(systemPalette(), false); });

  // ── mobile menu ──────────────────────────────────────────────────────────
  const menu = document.querySelector(".menu-btn"), nav = document.querySelector(".nav");
  menu?.addEventListener("click", () => { const open = nav.classList.toggle("open"); menu.setAttribute("aria-expanded", String(open)); });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

  // ── screen tabs ──────────────────────────────────────────────────────────
  const screens = {
    home: ["Home", "Everything at a glance: the addon switch and its URL, your library in numbers, scan progress and the newest titles.",
      ["One switch starts the addon and the streaming server", "Copy the addon or Nuvio collection URL, or show a QR", "Catch-up scan picks up posts made while the app was closed"]],
    library: ["Library", "Every title your channels hold, matched with TMDB, TVDB, Cinemeta and Kitsu artwork.",
      ["Search titles in any language", "Filter movies, series and anime; sort by recent, rating, title or year", "Ratings on every poster"]],
    title: ["Title page", "The details Stremio shows, plus every file that plays this title.",
      ["Backdrop, poster, cast, genres and runtime", "Each file with its quality and size", "Remove a bad copy in one tap"]],
    channels: ["Channels", "Point the app at your channels and groups. It indexes posts as they arrive.",
      ["Add by @username, t.me link or chat id", "Mark anime channels for absolute episode numbers", "Scan, rescan or stop with live progress"]],
    settings: ["Settings", "Metadata keys and language, catalog rules, stream preferences, server, backups and appearance.",
      ["46 metadata languages with English fallback", "Preferred quality and size limits", "Back up the catalog to your Saved Messages"]],
  };
  const tabs = document.querySelectorAll(".tab[data-screen]");
  function showScreen(key) {
    const [title, text, points] = screens[key];
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.screen === key)));
    const img = document.querySelector("#screen-img");
    if (img) { img.dataset.shot = key; img.alt = `TeleStremio ${title} screen`; swapShots(); }
    const note = document.querySelector(".screen-note");
    if (note) {
      note.querySelector("h3").textContent = title;
      note.querySelector("p").textContent = text;
      note.querySelector("ul").replaceChildren(...points.map((p) => Object.assign(document.createElement("li"), { textContent: p })));
    }
  }
  tabs.forEach((t) => t.addEventListener("click", () => showScreen(t.dataset.screen)));
  document.querySelector(".tabs")?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const list = [...tabs], i = list.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const next = list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
    next.focus(); showScreen(next.dataset.screen);
  });
  if (tabs.length) showScreen("home");

  // ── your platform ────────────────────────────────────────────────────────
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "macos" : /Linux/i.test(ua) ? "linux" : null;
  if (os) {
    const card = document.querySelector(`.platform[data-os="${os}"]`);
    if (card) {
      card.classList.add("you");
      card.querySelector("header")?.insertAdjacentHTML("beforeend", '<span class="badge-you">Your device</span>');
    }
    document.querySelectorAll(`.os-tab[data-os="${os}"]`).forEach((t) => t.click());
  }

  // ── guide: OS tabs ───────────────────────────────────────────────────────
  document.querySelectorAll(".os-tabs").forEach((group) => {
    const buttons = group.querySelectorAll(".os-tab");
    buttons.forEach((b) => b.addEventListener("click", () => {
      buttons.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      document.querySelectorAll(`.os-panel[data-group="${group.dataset.group}"]`).forEach((p) => { p.hidden = p.dataset.os !== b.dataset.os; });
    }));
  });
  if (os) document.querySelectorAll(`.os-tab[data-os="${os}"]`).forEach((t) => t.click());

  // ── copy buttons ─────────────────────────────────────────────────────────
  document.querySelectorAll(".copy").forEach((btn) => btn.addEventListener("click", async () => {
    const text = btn.parentElement.querySelector("pre").innerText.trim();
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { const r = document.createRange(); r.selectNodeContents(btn.parentElement.querySelector("pre")); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = "Selected"; }
    setTimeout(() => { btn.textContent = "Copy"; }, 1600);
  }));

  // ── guide: highlight the section in view ─────────────────────────────────
  const tocLinks = [...document.querySelectorAll(".toc a")];
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove("active"));
        byId.get(e.target.id)?.classList.add("active");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".doc h2[id]").forEach((h) => io.observe(h));
  }

  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
