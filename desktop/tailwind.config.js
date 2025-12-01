/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#c51662",
        "background-light": "#f8f6f7",
        "background-dark": "#211118",
        "text-light": "#1b0e14",
        "text-dark": "#f8f6f7",
        "text-muted-light": "#974e6e",
        "text-muted-dark": "#a88fa0",
        "surface-light": "#ffffff",
        "surface-dark": "#2a161f",
        "border-light": "#f3e7ec",
        "border-dark": "#402634",
        "primary-subtle-light": "#f3e7ec",
        "primary-subtle-dark": "#402634",
        "success": "#22c55e",
        "warning": "#f59e0b",
        "error": "#ef4444",
      },
      fontFamily: {
        "display": ["Plus Jakarta Sans", "'Noto Sans SC'", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "1.5rem",
        "xl": "2rem",
        "full": "9999px"
      },
      backgroundImage: {
        'sakura-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c51662' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      }
    },
  },
  plugins: [],
}

