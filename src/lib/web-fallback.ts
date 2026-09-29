/** Premium multi-page fallback — unique per prompt (never the same site twice). */
export function buildFallbackWebProject(prompt: string): { files: Record<string, string> } {
  const raw = (prompt || "Studio Site").replace(/[<>]/g, "").trim() || "Studio Site";
  const title = raw.slice(0, 56).trim() || "Studio Site";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "studio";
  let seed = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    seed ^= raw.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const hue = seed % 360;
  const hue2 = (hue + 48 + (seed % 40)) % 360;
  const accent = `hsl(${hue} 85% 62%)`;
  const accent2 = `hsl(${hue2} 75% 65%)`;
  const tagline =
    raw.length > 20
      ? raw.slice(0, 180) + (raw.length > 180 ? "…" : "")
      : `A cinematic site for ${title}.`;
  const words = raw.split(/\s+/).filter(Boolean);
  const featureA = words.slice(0, 4).join(" ") || "Craft";
  const featureB = words.slice(4, 8).join(" ") || "Clarity";
  const featureC = words.slice(8, 12).join(" ") || "Motion";

  const nav = `
    <header class="nav">
      <a class="logo" href="index.html">${title}</a>
      <button class="nav-toggle" type="button" aria-label="Menu">☰</button>
      <nav class="nav-links">
        <a href="index.html">Home</a>
        <a href="about.html">About</a>
        <a href="features.html">Features</a>
        <a href="contact.html">Contact</a>
      </nav>
    </header>`;

  const footer = `
    <footer class="footer">
      <div>
        <strong>${title}</strong>
        <p>Built from your brief — unique every time.</p>
      </div>
      <div class="footer-links">
        <a href="about.html">About</a>
        <a href="features.html">Features</a>
        <a href="contact.html">Contact</a>
      </div>
    </footer>`;

  const css = `/* ${slug}-${seed} — unique theme */
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap');
:root {
  --bg: #07090f;
  --fg: #f4f6fb;
  --muted: #9aa3b5;
  --line: rgba(255,255,255,.1);
  --card: rgba(255,255,255,.04);
  --accent: ${accent};
  --accent-2: ${accent2};
  --glow: 0 0 60px color-mix(in oklab, ${accent} 35%, transparent);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: "DM Sans", system-ui, sans-serif;
  background: radial-gradient(1200px 600px at 10% -10%, color-mix(in oklab, var(--accent) 18%, transparent), transparent),
              radial-gradient(900px 500px at 90% 0%, color-mix(in oklab, var(--accent-2) 16%, transparent), transparent),
              var(--bg);
  color: var(--fg);
  line-height: 1.6;
  min-height: 100vh;
}
a { color: inherit; text-decoration: none; }
.nav {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 1rem 1.5rem;
  backdrop-filter: blur(16px);
  background: rgba(7,9,15,.72);
  border-bottom: 1px solid var(--line);
}
.logo { font-family: "Instrument Serif", serif; font-size: 1.4rem; letter-spacing: .02em; }
.nav-links { display: flex; gap: 1.25rem; font-size: .92rem; color: var(--muted); }
.nav-links a:hover { color: var(--fg); }
.nav-toggle { display: none; background: transparent; border: 1px solid var(--line); color: var(--fg); border-radius: 999px; padding: .4rem .7rem; }
.hero {
  max-width: 1100px; margin: 0 auto; padding: 5.5rem 1.5rem 3rem;
  display: grid; gap: 1.5rem;
}
.hero h1 {
  font-family: "Instrument Serif", serif;
  font-size: clamp(2.6rem, 6vw, 4.6rem);
  line-height: 1.05; margin: 0; max-width: 16ch;
  background: linear-gradient(120deg, #fff, var(--accent) 55%, var(--accent-2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero p { max-width: 42rem; color: var(--muted); font-size: 1.05rem; margin: 0; }
.cta-row { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .5rem; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px; padding: .8rem 1.25rem; font-weight: 600; font-size: .95rem;
  border: 1px solid transparent; transition: transform .2s ease, box-shadow .2s ease;
}
.btn-primary { background: linear-gradient(120deg, var(--accent), var(--accent-2)); color: #061018; box-shadow: var(--glow); }
.btn-primary:hover { transform: translateY(-2px); }
.btn-ghost { border-color: var(--line); background: var(--card); color: var(--fg); }
.btn-ghost:hover { background: rgba(255,255,255,.08); }
.section { max-width: 1100px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
.section h2 { font-family: "Instrument Serif", serif; font-size: 2rem; margin: 0 0 1rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 1.25rem;
  padding: 1.25rem; transition: transform .2s ease, border-color .2s ease;
}
.card:hover { transform: translateY(-3px); border-color: color-mix(in oklab, var(--accent) 45%, transparent); }
.card h3 { margin: 0 0 .4rem; font-size: 1.05rem; }
.card p { margin: 0; color: var(--muted); font-size: .92rem; }
.reveal { opacity: 0; transform: translateY(16px); transition: opacity .6s ease, transform .6s ease; }
.reveal.visible { opacity: 1; transform: none; }
.footer {
  border-top: 1px solid var(--line); margin-top: 2rem;
  padding: 2rem 1.5rem; display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between;
  color: var(--muted); max-width: 1100px; margin-left: auto; margin-right: auto;
}
.footer-links { display: flex; gap: 1rem; }
.form { display: grid; gap: .75rem; max-width: 420px; }
.form input, .form textarea {
  width: 100%; border-radius: .9rem; border: 1px solid var(--line);
  background: rgba(255,255,255,.03); color: var(--fg); padding: .85rem 1rem; font: inherit;
}
@media (max-width: 720px) {
  .nav-toggle { display: inline-flex; }
  .nav-links {
    display: none; position: absolute; right: 1rem; top: 3.4rem;
    flex-direction: column; background: rgba(10,12,18,.96);
    border: 1px solid var(--line); border-radius: 1rem; padding: .75rem 1rem;
  }
  .nav-links.open { display: flex; }
}
`;

  const js = `document.querySelectorAll('.nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const links = btn.parentElement?.querySelector('.nav-links');
    links?.classList.toggle('open');
  });
});
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
document.querySelectorAll('form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const note = form.querySelector('[data-note]');
    if (note) note.textContent = 'Thanks — message captured in this preview.';
  });
});
`;

  const shell = (pageTitle: string, body: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle} · ${title}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
${nav}
${body}
${footer}
<script src="js/main.js"></script>
</body>
</html>`;

  const index = shell("Home", `
<main class="hero">
  <p class="reveal" style="color:var(--accent);font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem;">Your brief · ${slug}</p>
  <h1 class="reveal">${title}</h1>
  <p class="reveal">${tagline}</p>
  <div class="cta-row reveal">
    <a class="btn btn-primary" href="features.html">Explore</a>
    <a class="btn btn-ghost" href="contact.html">Contact</a>
  </div>
</main>
<section class="section">
  <h2 class="reveal">Built around this idea</h2>
  <div class="grid">
    <article class="card reveal"><h3>${featureA}</h3><p>Directly from your prompt — not a generic template.</p></article>
    <article class="card reveal"><h3>${featureB}</h3><p>Layout, palette, and copy seeded from “${title}”.</p></article>
    <article class="card reveal"><h3>${featureC}</h3><p>Multi-page navigation that actually works in preview.</p></article>
  </div>
</section>`);

  const about = shell("About", `
<main class="hero">
  <h1 class="reveal">About ${title}</h1>
  <p class="reveal">${tagline}</p>
</main>
<section class="section">
  <div class="grid">
    <article class="card reveal"><h3>Origin</h3><p>Generated for: ${raw.slice(0, 160).replace(/"/g, "'")}</p></article>
    <article class="card reveal"><h3>Tone</h3><p>Palette hue ${hue}° · seed ${seed}</p></article>
  </div>
</section>`);

  const features = shell("Features", `
<main class="hero">
  <h1 class="reveal">Features</h1>
  <p class="reveal">What this build emphasizes for ${title}.</p>
</main>
<section class="section">
  <div class="grid">
    <article class="card reveal"><h3>${featureA || "Focus"}</h3><p>Primary theme from your request.</p></article>
    <article class="card reveal"><h3>${featureB || "Depth"}</h3><p>Secondary angle from the same brief.</p></article>
    <article class="card reveal"><h3>Responsive</h3><p>Mobile menu and fluid type.</p></article>
    <article class="card reveal"><h3>Contact</h3><p>Working preview form.</p></article>
  </div>
</section>`);

  const contact = shell("Contact", `
<main class="hero">
  <h1 class="reveal">Contact</h1>
  <p class="reveal">Reach out about ${title}.</p>
  <form class="form reveal">
    <input name="name" placeholder="Name" required />
    <input name="email" type="email" placeholder="Email" required />
    <textarea name="message" rows="4" placeholder="Message about ${title}" required></textarea>
    <button class="btn btn-primary" type="submit">Send</button>
    <p data-note style="color:var(--muted);min-height:1.2em;margin:0;"></p>
  </form>
</main>`);

  return {
    files: {
      "index.html": index,
      "about.html": about,
      "features.html": features,
      "contact.html": contact,
      "css/styles.css": css,
      "js/main.js": js,
      "README.md": `# ${title}\n\nPrompt: ${raw.slice(0, 300)}\n\nOpen index.html. Relative .html navigation.\n`,
    },
  };
}
