import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Institutional dark palette
        ink: {
          950: "#050608",
          900: "#0a0c10",
          800: "#0f1218",
          700: "#151921",
          600: "#1d212b",
          500: "#262b37",
          400: "#3a4050",
          300: "#525a6e",
        },
        accent: {
          DEFAULT: "#5b8def",     // whisper blue
          400: "#7ba4f3",
          500: "#5b8def",
          600: "#4873c9",
        },
        signal: {
          bid: "#3ecf8e",          // green
          ask: "#ef5b5b",          // red
          neutral: "#a3a8b7",
          gold: "#d4af37",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Menlo"', "monospace"],
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
      boxShadow: {
        "inner-glow": "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.6s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
    },
  },
  plugins: [],
};

export default config;
