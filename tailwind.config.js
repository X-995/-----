/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f6f8",
          100: "#e7e9ee",
          200: "#c9ced9",
          300: "#a3abbd",
          400: "#76819b",
          500: "#566179",
          600: "#434c5f",
          700: "#363d4d",
          800: "#2b303c",
          900: "#1d212a",
          950: "#13161d",
        },
        accent: {
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
