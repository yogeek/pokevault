import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fef2f2',
          100: '#fee2e2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          900: '#7f1d1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        // Pokéball gently tilting while it waits to be thrown
        wobble: {
          '0%, 100%': { transform: 'rotate(-7deg)' },
          '50%':      { transform: 'rotate(7deg)' },
        },
        // Classic capture shake (3 diminishing jolts), then settle
        'capture-shake': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%':      { transform: 'rotate(-22deg)' },
          '30%':      { transform: 'rotate(18deg)' },
          '45%':      { transform: 'rotate(-14deg)' },
          '60%':      { transform: 'rotate(10deg)' },
          '75%':      { transform: 'rotate(-5deg)' },
        },
        // Card shrinking + spiralling into the ball
        'card-suck': {
          '0%':   { transform: 'scale(1) translate(0, 0) rotate(0deg)', opacity: '1' },
          '55%':  { transform: 'scale(0.35) translate(54px, -6px) rotate(220deg)', opacity: '0.7' },
          '100%': { transform: 'scale(0) translate(54px, -6px) rotate(420deg)', opacity: '0' },
        },
        // Success badge popping in with a slight overshoot
        'pop-in': {
          '0%':   { transform: 'scale(0)',    opacity: '0' },
          '70%':  { transform: 'scale(1.18)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        // Star burst around the ball on capture
        sparkle: {
          '0%':   { transform: 'scale(0) rotate(0deg)',   opacity: '0' },
          '40%':  { opacity: '1' },
          '100%': { transform: 'scale(1.8) rotate(90deg)', opacity: '0' },
        },
      },
      animation: {
        wobble:          'wobble 1.4s ease-in-out infinite',
        'capture-shake': 'capture-shake 0.55s ease-in-out 2',
        'card-suck':     'card-suck 0.75s ease-in forwards',
        'pop-in':        'pop-in 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) forwards',
        sparkle:         'sparkle 0.8s ease-out forwards',
      },
    },
  },
  plugins: [forms],
} satisfies Config
