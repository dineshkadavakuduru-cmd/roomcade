/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './games/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#0d0d24',
        indigo: { base: '#171736', deep: '#101028' },
        neon: { orange: '#ff6b35', pink: '#ff3d81', violet: '#8b5cf6' },
        cream: '#fff6e9',
      },
      fontFamily: {
        display: ['"Baloo 2"', '"Nunito"', 'system-ui', 'sans-serif'],
        body: ['"Nunito"', 'system-ui', 'sans-serif'],
        code: ['"Space Grotesk"', 'monospace'],
      },
      borderRadius: { arcade: '28px', pill: '999px', chip: '16px' },
      boxShadow: {
        'neon-orange': '0 0 24px rgba(255,107,53,.45)',
        'neon-pink': '0 0 24px rgba(255,61,129,.45)',
        'inset-hi': 'inset 0 1px 0 rgba(255,255,255,.16)',
      },
    },
  },
  plugins: [],
};
