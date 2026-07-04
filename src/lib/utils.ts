import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MATERIALS = [
  {
    id: 'fabric',
    name: 'Fabric',
    description: 'Cotton, silk, denim, and synthetic blends — cut clean, no fray.',
    texture: 'texture-fabric',
  },
  {
    id: 'leather',
    name: 'Leather',
    description: 'Genuine and synthetic leather — precision edges, every time.',
    texture: 'texture-leather',
  },
  {
    id: 'wood',
    name: 'Wood',
    description: 'Plywood, MDF, and hardwoods — from signage to furniture components.',
    texture: 'texture-wood',
  },
  {
    id: 'acrylic',
    name: 'Acrylic',
    description: 'Clear, colored, and mirrored acrylic — polished edges, flawless finish.',
    texture: 'texture-acrylic',
  },
] as const;

export const PROCESS_STEPS = [
  {
    step: '01',
    title: 'Upload Your Design',
    description: 'Send us your vector file — AI, EPS, SVG, or DXF. We accept them all.',
  },
  {
    step: '02',
    title: 'Precision Cut',
    description: 'Our CO2 laser cuts with sub-millimeter accuracy on your chosen material.',
  },
  {
    step: '03',
    title: 'Quality Check',
    description: 'Every piece is inspected for edge quality, dimensional accuracy, and finish.',
  },
  {
    step: '04',
    title: 'Deliver to You',
    description: 'Packaged with care and delivered anywhere in Lagos — or come pick it up.',
  },
] as const;
