import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Paberin — laser cutting services in Ogba, Ikeja, Lagos.',
};

export default function ContactPage() {
  return <ContactForm />;
}
