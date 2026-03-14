import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        body: ['Outfit', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#06080a',
          1: '#0c1015',
          2: '#121820',
          3: '#1a2230',
          4: '#232e40',
        },
        bull: {
          DEFAULT: '#00e87b',
          dim: '#00e87b33',
          glow: '#00e87b22',
        },
        bear: {
          DEFAULT: '#ff3b5c',
          dim: '#ff3b5c33',
          glow: '#ff3b5c22',
        },
        neutral: {
          DEFAULT: '#ffb224',
          dim: '#ffb22433',
          glow: '#ffb22422',
        },
        muted: '#5a6578',
        subtle: '#3a4455',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'bar-fill': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'slide-up': 'slide-up 0.5s ease-out forwards',
        'scale-in': 'scale-in 0.3s ease-out forwards',
        'bar-fill': 'bar-fill 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
