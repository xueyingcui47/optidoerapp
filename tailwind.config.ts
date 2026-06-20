import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598dff",
          500: "#3366f5",
          600: "#244ae0",
          700: "#1d3ab6",
          800: "#1d3390",
          900: "#1d3072",
        },
      },
    },
  },
  plugins: [],
};

export default config;
