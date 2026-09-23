import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./chat-page";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat with Zeros — AI by VsiStudio" },
      {
        name: "description",
        content:
          "Talk to Zeros: web search, image generation, real 3D models, original songs and full website building in one always-on AI.",
      },
      { property: "og:title", content: "Chat with Zeros" },
      {
        property: "og:description",
        content: "Search, images, 3D models, songs and websites — powered by Zeros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});
