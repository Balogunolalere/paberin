import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vercel: {
          bg: '#FFFFFF',
          text: '#000000',
          muted: '#666666',
          border: '#EAEAEA',
          accent: '#FF5C00',
          accentHover: '#E05200',
        },
        // Spec-compatible aliases mapped to vercel theme
        background: '#FFFFFF',
        primary: '#000000',
        secondary: '#666666',
        muted: '#888888',
        accent: '#FF5C00',
        'accent-hover': '#E05200',
        surface: '#F7F7F7',
        'surface-raised': '#FFFFFF',
        border: '#EAEAEA',
        'border-strong': '#D4D4D4',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      spacing: {
        section: 'clamp(4rem, 10vw, 8rem)',
        gutter: 'clamp(1.5rem, 5vw, 3rem)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'blink': 'blink 1.5s ease-in-out infinite',
        'craft-pulse': 'craftPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        craftPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
      },
      borderRadius: {
        card: '8px',
        button: '6px',
      },
    },
  },
  plugins: [],
};
export default config;

