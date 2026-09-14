import { groqText, manusChat } from "@/lib/providers.server";

/**
 * Zeros Native Paint Engine
 *
 * This module deliberately does NOT call Imagen, Nano Banana, Gemini image
 * models, Stable Diffusion, or another image-generation provider. Zeros asks
 * a text model for a scene description, then paints the final SVG itself from
 * primitives, gradients, paths, lighting layers, particles and typography.
 */

type ScenePlan = {
  subject: string;
  palette: string;
  environment: string;
  lighting: string;
  mood: string;
  camera: string;
  details: string[];
};

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
const clamp = (value: string, max = 900) => value.replace(/\s+/g, " ").trim().slice(0, max);

async function planScene(prompt: string): Promise<ScenePlan> {
  const system = `You are Zeros Paint Engine's art director. Convert the user's request into a compact scene plan for a renderer that paints every pixel itself using SVG/vector primitives. Do not request an image model. Return ONLY JSON with keys subject,palette,environment,lighting,mood,camera,details. Keep details as 4-8 short strings. Describe colors in plain English.`;
  const manus = await manusChat(system, [{ role: "user", content: prompt }], 9000);
  const groq = manus ? null : await groqText(system, prompt);
  const raw = manus || groq;
  if (raw) {
    try {
      const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(clean) as Partial<ScenePlan>;
      return {
        subject: clamp(parsed.subject || prompt, 260),
        palette: clamp(parsed.palette || "cinematic teal, graphite and silver", 180),
        environment: clamp(parsed.environment || "premium dark studio", 180),
        lighting: clamp(parsed.lighting || "large softbox key with cool rim light", 180),
        mood: clamp(parsed.mood || "cinematic premium", 140),
        camera: clamp(parsed.camera || "three-quarter hero view", 140),
        details: Array.isArray(parsed.details) ? parsed.details.filter((v): v is string => typeof v === "string").slice(0, 8).map((v) => clamp(v, 140)) : [],
      };
    } catch {
      // Fall through to a deterministic local plan.
    }
  }
  const lower = prompt.toLowerCase();
  const isCar = /car|vehicle|ferrari|lamborghini|porsche|sports car|supercar/.test(lower);
  return {
    subject: clamp(prompt, 260),
    palette: isCar ? "deep crimson, black carbon, brushed silver and icy white" : "electric cyan, violet, black and silver",
    environment: isCar ? "dark automotive photo studio" : "cinematic premium studio",
    lighting: "large rectangular softbox, bright rim, subtle volumetric haze",
    mood: "cinematic, premium, dramatic",
    camera: "low three-quarter hero view",
    details: ["clean silhouette", "sharp highlights", "soft contact shadow", "fine surface detail", "controlled reflections"],
  };
}

function defs(): string {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03050b"/><stop offset="0.48" stop-color="#0a1220"/><stop offset="1" stop-color="#020309"/></linearGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#50e7ff" stop-opacity=".28"/><stop offset=".48" stop-color="#7b61ff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0.9" y2="1"><stop stop-color="#eef5fb"/><stop offset=".28" stop-color="#8c9bab"/><stop offset=".5" stop-color="#f8fbff"/><stop offset=".75" stop-color="#46515e"/><stop offset="1" stop-color="#cfd9e4"/></linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff314f"/><stop offset=".34" stop-color="#c40e32"/><stop offset=".68" stop-color="#6b071d"/><stop offset="1" stop-color="#ed2949"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061321"/><stop offset=".45" stop-color="#1c5871"/><stop offset=".65" stop-color="#08141f"/><stop offset="1" stop-color="#01050b"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#151e28"/><stop offset="1" stop-color="#05070b"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="shadow"><feGaussianBlur in="SourceAlpha" stdDeviation="18"/><feOffset dy="18"/><feComponentTransfer><feFuncA type="linear" slope=".65"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width="72" height="36" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)"><path d="M0 0H72M0 0V36" fill="none" stroke="#7e9db1" stroke-opacity=".10" stroke-width="1"/></pattern>
  </defs>`;
}

function wheel(cx: number, cy: number, scale = 1): string {
  const spokes = Array.from({ length: 10 }, (_, i) => `<path d="M${cx} ${cy} L${cx + Math.cos(i * Math.PI / 5) * 42 * scale} ${cy + Math.sin(i * Math.PI / 5) * 42 * scale}" stroke="#e9f1f7" stroke-opacity=".9" stroke-width="5"/>`).join("");
  return `<g filter="url(#shadow)"><ellipse cx="${cx}" cy="${cy}" rx="54" ry="78" fill="#05070a"/><ellipse cx="${cx}" cy="${cy}" rx="39" ry="57" fill="url(#metal)" stroke="#1b2027" stroke-width="8"/><g>${spokes}</g><circle cx="${cx}" cy="${cy}" r="12" fill="#8f9dab"/><circle cx="${cx}" cy="${cy}" r="5" fill="#11151a"/></g>`;
}

function carPainting(): string {
  return `<g transform="translate(0 34)" filter="url(#shadow)">
    <ellipse cx="960" cy="690" rx="640" ry="76" fill="#000" opacity=".72" filter="url(#blur)"/>
    <path d="M330 610 C380 555 450 514 560 492 L665 370 C716 311 790 278 900 278 L1090 278 C1200 284 1280 326 1338 390 L1445 506 C1510 523 1572 562 1612 616 L1582 675 L1430 675 C1408 612 1360 575 1292 575 C1218 575 1164 615 1148 678 L760 678 C742 610 690 575 620 575 C548 575 492 615 472 678 L334 678 Z" fill="url(#paint)" stroke="#ff9cae" stroke-opacity=".22" stroke-width="5"/>
    <path d="M655 475 L712 383 C755 327 815 304 906 304 L1084 304 C1174 308 1234 336 1274 390 L1342 475 Z" fill="url(#glass)" stroke="#bcefff" stroke-opacity=".34" stroke-width="4"/>
    <path d="M906 307 L900 473 M1086 309 L1092 473" stroke="#9fd6e8" stroke-opacity=".30" stroke-width="4"/>
    <path d="M350 560 C520 522 675 505 850 506 C1090 505 1325 518 1538 568" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="9"/>
    <path d="M405 616 C530 595 640 590 748 603" fill="none" stroke="#ffb7c1" stroke-opacity=".25" stroke-width="12"/>
    <path d="M1168 602 C1280 584 1410 591 1532 620" fill="none" stroke="#ffb7c1" stroke-opacity=".22" stroke-width="12"/>
    <path d="M350 641 L470 641 M1450 641 L1574 641" stroke="#080b10" stroke-width="30" stroke-linecap="round"/>
    <path d="M1358 534 L1488 552 L1530 587 L1395 579 Z" fill="#07090d" stroke="#8b9aaa" stroke-opacity=".28"/>
    <path d="M420 536 L528 515 L555 550 L430 570 Z" fill="#090b10"/>
    <path d="M1370 535 L1434 548 L1458 566 L1392 560 Z" fill="#e9fbff" filter="url(#glow)"/>
    <path d="M444 541 L520 527 L535 548 L454 557 Z" fill="#ff173d" filter="url(#glow)"/>
    <path d="M510 678 L1415 678" stroke="#090b0f" stroke-width="20"/>
    ${wheel(610, 626, .9)}${wheel(1302, 626, .9)}
    <path d="M365 676 L760 676" stroke="#090b10" stroke-width="32"/><path d="M1150 676 L1572 676" stroke="#090b10" stroke-width="32"/>
    <path d="M820 641 L1100 641" stroke="#090b10" stroke-width="14"/>
    <path d="M785 680 L1118 680" stroke="#f2f7fb" stroke-opacity=".45" stroke-width="5"/>
  </g>`;
}

function genericPainting(plan: ScenePlan): string {
  const hash = [...plan.subject].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hue = hash % 360;
  return `<g>
    <circle cx="960" cy="410" r="470" fill="url(#halo)" filter="url(#blur)"/>
    <ellipse cx="960" cy="710" rx="470" ry="60" fill="#000" opacity=".68" filter="url(#blur)"/>
    <g transform="translate(960 470) rotate(${(hash % 8) - 4})">
      <path d="M-360 170 C-300 -30 -210 -170 0 -240 C210 -170 300 -30 360 170 C190 235 -190 235 -360 170Z" fill="hsl(${hue} 68% 46%)" stroke="#dffbff" stroke-opacity=".34" stroke-width="8"/>
      <path d="M-245 105 C-210 -50 -120 -125 0 -170 C120 -125 210 -50 245 105 C120 150 -120 150 -245 105Z" fill="#07111b" stroke="#8feaff" stroke-opacity=".45" stroke-width="5"/>
      <path d="M-290 62 Q0 -30 290 62" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="13"/>
      <circle cx="-140" cy="74" r="30" fill="#fff" fill-opacity=".75" filter="url(#glow)"/><circle cx="140" cy="74" r="30" fill="#fff" fill-opacity=".75" filter="url(#glow)"/>
    </g>
    <g opacity=".5">${Array.from({ length: 14 }, (_, i) => `<circle cx="${180 + ((hash + i * 137) % 1560)}" cy="${110 + ((hash + i * 83) % 480)}" r="${2 + (i % 4)}" fill="#a9f5ff"/>`).join("")}</g>
  </g>`;
}

function paintSvg(prompt: string, plan: ScenePlan): string {
  const isCar = /car|vehicle|ferrari|lamborghini|porsche|sports car|supercar/i.test(`${prompt} ${plan.subject}`);
  const title = esc(plan.subject);
  const description = esc(`${plan.mood}. ${plan.camera}. ${plan.lighting}. ${plan.environment}. ${plan.details.join(", ")}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="${title}">
    ${defs()}
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <ellipse cx="960" cy="380" rx="760" ry="430" fill="url(#halo)" opacity=".55"/>
    <path d="M0 820 Q480 735 960 800 T1920 820 V1080 H0Z" fill="url(#floor)"/>
    <rect y="790" width="1920" height="290" fill="url(#grid)" opacity=".7"/>
    <path d="M0 785 Q960 720 1920 785" fill="none" stroke="#7beeff" stroke-opacity=".18" stroke-width="2"/>
    ${isCar ? carPainting() : genericPainting(plan)}
    <g opacity=".9"><text x="84" y="936" fill="#d9e8f2" font-family="Inter,Arial,sans-serif" font-size="20" letter-spacing="4">ZEROS NATIVE PAINT</text><text x="84" y="970" fill="#7892a4" font-family="Inter,Arial,sans-serif" font-size="14">${description}</text></g>
  </svg>`;
}

export async function generateStudioImage(prompt: string): Promise<{ dataUrl: string; model: string } | null> {
  const plan = await planScene(prompt);
  const svg = paintSvg(prompt, plan);
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  return { dataUrl, model: "zeros-native-paint-engine-v1" };
}
