import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        manga: "0 16px 50px rgba(15, 23, 42, 0.12)",
        "manga-sm": "4px 4px 0 #111827",
        "manga-hover": "0 20px 60px rgba(15, 23, 42, 0.18)",
      },
      borderRadius: {
        studio: "1.35rem",
      },
      screens: {
        xs: "480px",
      },
    },
  },
  plugins: [],
};

export default config;
