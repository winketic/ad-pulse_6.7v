import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Dark theme palette
        dp: {
          bg:     "#0a0a0a",
          card:   "#111111",
          hover:  "#161616",
          border: "#1f1f1f",
          text:   "#ededed",
          muted:  "#888888",
          faint:  "#444444",
        },
        accent: {
          DEFAULT: "#5A8DF0",
          hover:   "#3D74E6",
          dim:     "rgba(90,141,240,0.15)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
