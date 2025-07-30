/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'deep-purple': '#5E40A4',
        'medium-purple': '#7E57C2',
        'light-purple': '#A38DE0',
        'teal-blue': '#43A6D7',
        'bright-blue': '#329FD4',
        'light-blue': '#cce3ebff',
      },
      borderWidth: {
        DEFAULT: "1px",
        "0.5": "0.5px",
      },
      boxShadow: {
        'inner-strong': 'inset 0 2px 6px rgba(0, 0, 0, 0.15)',
      },
      animation: {
        'spin-slow': 'spin 18s linear infinite',
      },
    },
  },
  plugins: [],
};
