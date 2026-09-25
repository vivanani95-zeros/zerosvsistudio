import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./chat-page";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Zeros — World's First MMI" },
      {
        name: "description",
        content:
          "Zeros is the world's first MMI (Multi-Modular Intelligence) by VsiStudio — built to crush complex tasks. Generate 3D models, songs, websites, images, videos, animations, and full conversations. Capabilities no single AI can match alone.",
      },
      { name: "application-name", content: "Zeros" },
      { property: "og:site_name", content: "Zeros" },
      { property: "og:title", content: "Zeros — World's First MMI" },
      {
        property: "og:description",
        content:
          "Zeros is the world's first MMI (Multi-Modular Intelligence) by VsiStudio — built to crush complex tasks. Generate 3D models, songs, websites, images, videos, animations, and full conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zeros — World's First MMI" },
    ],
  }),
  component: ChatPage,
});
