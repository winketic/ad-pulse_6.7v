import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AD Pulse",
    short_name: "AD Pulse",
    description: "Учёт материалов на производстве",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#05050a",
    theme_color: "#05050a",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
