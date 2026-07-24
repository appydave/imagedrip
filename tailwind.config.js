/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // AppyDave light palette — warm cream, brown text, amber/yellow accents.
      // NEVER a dark console (working-rules §6). Mirrors pipeline-light.html tokens.
      colors: {
        cream: '#faf5ec',
        surface: '#f0ebe4',
        linen: '#e8e0d4',
        edge: '#d4cdc4',
        brown: '#342d2d',
        muted: '#7a6e5e',
        gold: '#ccba9d',
        yellow: '#ffde59',
        amber: '#c8841a',
        sage: '#4a7a54',
        gpt: '#0d0d0d', // the native ChatGPT panel — the ONLY dark surface
      },
      fontFamily: {
        // Oswald/Roboto if present; system fallbacks keep the shell offline + CSP-tight.
        display: ['Oswald', 'Roboto Condensed', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
