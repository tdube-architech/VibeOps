import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0b',
        foreground: '#f5f5f7',
        primary: '#8b5cf6',
        muted: '#1f1f23',
        border: '#27272a'
      }
    }
  },
  plugins: []
};
export default config;
