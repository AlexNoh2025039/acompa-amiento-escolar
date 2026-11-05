/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3498db',
        secondary: '#f1c40f',
        tertiary: '#2c3e50',
        accent: '#e67e22',
        success: '#27ae60',
        page: '#ecf0f1',
        card: '#ffffff',
        line: '#bdc3c7',
      },
    },
  },
  plugins: [],
}
