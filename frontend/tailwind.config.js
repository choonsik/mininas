/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          bg: '#1e1e24',
          card: '#282830',
          hover: '#32323c',
          accent: '#0a84ff',
          text: '#f5f5f7',
          muted: '#86868b',
        }
      }
    },
  },
  plugins: [],
}
