/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // This is crucial
  content: [
    "./src/**/*.{html,ts}", // This line includes all .html and .ts files in your src folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
