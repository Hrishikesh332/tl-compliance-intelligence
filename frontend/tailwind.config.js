import strandPreset from './strand/tailwind-preset.js'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [strandPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './strand/**/*.js'],
  theme: { extend: {} },
  plugins: [],
}
