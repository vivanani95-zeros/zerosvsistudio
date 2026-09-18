import { createFileRoute } from "@tanstack/react-router";
import {
  MAI_CHARACTERS,
  clearMaiCookies,
  gateCookie,
  hasGate,
  sessionCookie,
  verifySecret,
  type MaiCharacter,
  getMaiSession,
} from "@/lib/mai-auth.server";

const CHARACTER_SECRETS: Record<MaiCharacter, string> = {
  "SPIDER-MAN": "SPIDER_GUY",
  "IRON-MAN": "IRON_MAN",
  THOR: "THOR_HAMMER",
};

function noStore() {
  return {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
  };
}

export const Route = createFileRoute("/api/mai/access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getMaiSession(request);
        return Response.json(
          {
            gate: hasGate(request),
            authenticated: Boolean(session),
            character: session?.character ?? null,
            characters: MAI_CHARACTERS,
          },
          { headers: noStore() },
        );
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          stage?: "gate" | "character";
          password?: string;
          character?: MaiCharacter;
        };
        const password = String(body.password ?? "");
        if (!password || password.length > 512) return Response.json({ error: "Invalid password." }, { status: 400, headers: noStore() });

        if (body.stage === "gate") {
          const expected = process.env["MAI_PASSWORD_JS"];
          if (!expected || !(await verifySecret(password, expected))) {
            return Response.json({ error: "Access denied." }, { status: 401, headers: noStore() });
          }
          return new Response(JSON.stringify({ ok: true, next: "character" }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...noStore(), "Set-Cookie": gateCookie() },
          });
        }

        if (body.stage === "character") {
          if (!hasGate(request)) return Response.json({ error: "Complete the MAI access gate first." }, { status: 403, headers: noStore() });
          const character = body.character;
          if (!character || !MAI_CHARACTERS.includes(character)) return Response.json({ error: "Unknown character." }, { status: 400, headers: noStore() });
          const envName = CHARACTER_SECRETS[character];
          const expected = process.env[envName];
          if (!expected || !(await verifySecret(password, expected))) {
            return Response.json({ error: "Character password incorrect." }, { status: 401, headers: noStore() });
          }
          return new Response(JSON.stringify({ ok: true, character }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...noStore(), "Set-Cookie": sessionCookie(character) },
          });
        }

        return Response.json({ error: "Invalid access stage." }, { status: 400, headers: noStore() });
      },
      DELETE: async () => {
        const headers = new Headers({ "Content-Type": "application/json", ...noStore() });
        for (const value of clearMaiCookies()) headers.append("Set-Cookie", value);
        return new Response(JSON.stringify({ ok: true }), { headers });
      },
    },
  },
});
