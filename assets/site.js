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
    catalogs: ["Catalogs", "Rows of your own in Stremio and Nuvio, next to the ones TMDB fills by itself.",
      ["Make, rename, reorder or hide your own catalogs", "Add a title from its page", "Auto catalogs by language, OTT service and Latest Releases"]],
    settings: ["Settings", "Metadata keys and language, catalog rules, stream preferences, server, backups and appearance.",
      ["46 metadata languages with English fallback", "Preferred quality and size limits", "Back up the catalog to your Saved Messages"]],
  };
  const tabs = document.querySelectorAll(".tab[data-screen]");
  function showScreen(key) {
    const [title, text, points] = screens[key];
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.screen === key)));
    const img = document.querySelector("#screen-img");
    if (img) { img.dataset.shot = key; img.alt = `TeleStremio ${title} screen`; }
    const phone = document.querySelector("#phone-img");
    if (phone) { phone.dataset.shot = `phone-${key === "catalogs" ? "library" : key}`; phone.alt = `TeleStremio ${title} screen on Android`; }
    swapShots();
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

  // ── direct downloads ─────────────────────────────────────────────────────
  // Buttons point at the newest release page until the file list arrives, then at the file itself.
  // Android picks the APK for the browser's CPU: aarch64 → arm64, armv7 → armeabi-v7a, anything
  // unclear (armv8l, x86) → universal, which installs everywhere.
  const androidApk = () => {
    const p = `${navigator.platform || ""} ${ua}`;
    if (/aarch64|arm64/i.test(p)) return /arm64-v8a\.apk$/;
    if (/armv7/i.test(p)) return /armeabi-v7a\.apk$/;
    return /universal\.apk$/;
  };
  const wanted = { android: androidApk(), windows: /\.msi$/, macos: /\.dmg$/, linux: /_amd64\.deb$/ };
  const mb = (b) => `${Math.round(b / 1048576)} MB`;
  // One API call gives the latest release and every release's download counts (60 calls/hour
  // per visitor without a token, so the answer is kept for ten minutes).
  async function releases() {
    try { const c = JSON.parse(sessionStorage.getItem("releases")); if (c && Date.now() - c.at < 600000) return c; } catch { /* private mode */ }
    const r = await fetch("https://api.github.com/repos/weebzone/Telegram-Stremio/releases?per_page=100", { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const list = (await r.json()).filter((x) => !x.draft && /^TeleStremio/.test(x.name || ""));
    const latest = list.find((x) => !x.prerelease) || list[0];
    const data = {
      at: Date.now(),
      tag: latest.tag_name,
      assets: latest.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
      downloads: list.reduce((n, x) => n + x.assets.reduce((m, a) => m + a.download_count, 0), 0),
    };
    try { sessionStorage.setItem("releases", JSON.stringify(data)); } catch { /* private mode */ }
    return data;
  }
  const latestAssets = () => releases().then((d) => d.assets);

  // ── hero numbers: count up when shown, then follow the live figures ─────────
  const short = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString("en"));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countTo(el, to) {
    const from = Number(el.dataset.at || 0);
    el.dataset.at = to;
    if (!el.firstChild) el.innerHTML = '<span class="stat-ghost" aria-hidden="true"></span><span class="stat-live"></span>';
    const [ghost, live] = el.children;
    ghost.textContent = short(to);
    if (still || from === to) { live.textContent = short(to); return; }
    const t0 = performance.now(), ms = 1800 + Math.min(String(to).length * 150, 700);
    el.classList.remove("landed");
    const step = (t) => {
      const k = Math.min((t - t0) / ms, 1), e = 1 - Math.pow(1 - k, 4);
      live.textContent = short(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else el.classList.add("landed");
    };
    requestAnimationFrame(step);
  }
  const stats = [...document.querySelectorAll(".stat-n")];
  stats.forEach((el) => { el.innerHTML = '<span class="stat-ghost" aria-hidden="true"></span><span class="stat-live"></span>'; el.children[0].textContent = short(+el.dataset.to); });
  let shown = false;
  const show = () => { shown = true; stats.forEach((el, i) => setTimeout(() => countTo(el, +el.dataset.to), i * 110)); };
  if ("IntersectionObserver" in window && stats.length) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); show(); } }, { threshold: 0.4 });
    io.observe(stats[0]);
  } else show();
  const platforms = (assets) => new Set(assets.flatMap((a) =>
    /\.apk$/.test(a.name) ? ["Android", "Android TV"] : /\.msi$/.test(a.name) ? ["Windows"] : /\.dmg$/.test(a.name) ? ["macOS"]
      : /\.deb$/.test(a.name) ? ["Linux"] : /\.jar$/.test(a.name) ? ["Server"] : [])).size;
  function liveStats() {
    releases().then((d) => {
      const set = (key, n) => document.querySelectorAll(`[data-stat="${key}"]`).forEach((el) => {
        el.dataset.to = n;
        if (shown) countTo(el, n); else el.children[0].textContent = short(n);
      });
      set("downloads", d.downloads);
      if (platforms(d.assets)) set("platforms", platforms(d.assets));
      document.querySelectorAll("[data-tag]").forEach((t) => { t.textContent = d.tag; });
    }).catch(() => { /* rate-limited or offline: the numbers in the page stay */ });
  }
  liveStats();
  setInterval(() => { if (!document.hidden) liveStats(); }, 600000);

  latestAssets().then((assets) => {
    const fileFor = (key) => assets.find((a) => wanted[key].test(a.name));
    document.querySelectorAll("[data-download]").forEach((btn) => {
      const f = fileFor(btn.dataset.download);
      if (!f) return;
      btn.href = f.url;
      btn.title = `${f.name} · ${mb(f.size)}`;
    });
    const hero = document.querySelector("[data-download-hero]");
    const mine = os && fileFor(os);
    if (hero && mine) {
      hero.href = mine.url;
      hero.title = `${mine.name} · ${mb(mine.size)}`;
      hero.querySelector("span").textContent = `Download for ${{ android: "Android", windows: "Windows", macos: "macOS", linux: "Linux" }[os]}`;
    }
  }).catch(() => { /* rate-limited or offline: the release page links stay */ });

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
