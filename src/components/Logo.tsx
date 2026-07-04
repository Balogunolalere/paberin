import { Great_Vibes } from 'next/font/google';

const greatVibes = Great_Vibes({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span 
      className={`${greatVibes.className} text-[#FF5C00] ${className}`}
      style={{
        WebkitTextStroke: '1px #FF5C00', // makes the thin font appear thicker
      }}
    >
      Paberin
    </span>
  );
}