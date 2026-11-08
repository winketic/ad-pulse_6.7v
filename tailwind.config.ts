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
        // Light theme palette — Stripe-like, calm and readable
        dp: {
          bg:     "#f7f7f8",
          card:   "#ffffff",
          hover:  "#f4f4f5",
          border: "#e4e4e7",
          text:   "#18181b",
          muted:  "#71717a",
          faint:  "#a1a1aa",
        },
        accent: {
          DEFAULT: "#2563eb",
          hover:   "#1d4ed8",
          dim:     "rgba(37, 99, 235, 0.12)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
