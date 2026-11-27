import type { Config } from "tailwindcss";

const config: Config = {
  // Тёмная тема включается атрибутом data-theme="dark" на <html>.
  // Без этого dark: классы не работают и точечные светлые чипы
  // (бейджи ролей, плашки ошибок) не адаптируются под тёмный фон.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        // Продукт: 4 px, модальные окна 6 px (MASTER_DESIGN_SPEC §09.1).
        // Централизованное приведение существующих rounded-* классов к
        // утверждённой геометрии без правки каждого компонента.
        none: "0px",
        sm: "4px",
        DEFAULT: "4px",
        md: "4px",
        lg: "4px",
        xl: "6px",
        "2xl": "6px",
        "3xl": "6px",
        full: "9999px",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Altai Dynamics «Architectural Mono» (MASTER_DESIGN_SPEC §07).
        // Единственная тёмная тема. Нейтрали — производные брендовых
        // цветов (DESIGN.md), не самостоятельная палитра.
        brand: {
          carbon: "#111111",
          graphite: "#292929",
          white: "#F2F0EB",
          lime: "#B2F230",
          concrete: "#858585",
        },
        dp: {
          bg:     "#111111",
          card:   "#1D1D1D",
          hover:  "#292929",
          border: "#2C2C2C",
          text:   "#F2F0EB",
          muted:  "#A3A3A3",
          faint:  "#7F7F7F",
        },
        accent: {
          DEFAULT: "#B2F230",
          hover:   "#A0DA2B",
          dim:     "rgba(178, 242, 48, 0.15)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
