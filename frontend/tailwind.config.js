/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        acid: "#D1FF00",
        brand: "#D1FF00",
        cosmic: "#050505",
        dark: {
          DEFAULT: "#050505",
          100: "#0a0a0a",
          200: "#111111",
          300: "#1a1a1a",
          400: "#222222",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "mesh-1": "meshFloat1 22s ease-in-out infinite",
        "mesh-2": "meshFloat2 28s ease-in-out infinite",
        "mesh-3": "meshFloat3 19s ease-in-out infinite",
        "scan": "scanLine 9s linear infinite",
        "pulse-acid": "pulseAcid 3s ease-in-out infinite",
        "hud-blink": "hudBlink 1.4s step-end infinite",
        "counter": "counterSpin 4s linear infinite",
        "draw-in": "drawIn 1s ease forwards",
      },
      keyframes: {
        meshFloat1: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(50px, -40px) scale(1.06)" },
          "66%": { transform: "translate(-30px, 60px) scale(0.94)" },
        },
        meshFloat2: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-60px, 50px) scale(1.08)" },
          "66%": { transform: "translate(40px, -30px) scale(0.92)" },
        },
        meshFloat3: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(30px, 40px) scale(1.04)" },
        },
        scanLine: {
          "0%": { top: "-2px", opacity: "0" },
          "5%": { opacity: "1" },
          "95%": { opacity: "0.6" },
          "100%": { top: "100%", opacity: "0" },
        },
        pulseAcid: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(209, 255, 0, 0)" },
          "50%": { boxShadow: "0 0 24px 4px rgba(209, 255, 0, 0.12)" },
        },
        hudBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        counterSpin: {
          "0%": { content: '"4821"' },
          "25%": { content: '"9037"' },
          "50%": { content: '"1654"' },
          "75%": { content: '"7290"' },
        },
        drawIn: {
          from: { strokeDashoffset: "500" },
          to: { strokeDashoffset: "0" },
        },
      },
    },
  },
  plugins: [],
};
