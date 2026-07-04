'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OrderFormData {
  name: string;
  email: string;
  material: string;
  description: string;
}

const MATERIAL_OPTIONS = [
  { value: '', label: 'Select a material' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'leather', label: 'Leather' },
  { value: 'wood', label: 'Wood' },
  { value: 'acrylic', label: 'Acrylic' },
  { value: 'other', label: 'Other (specify in description)' },
];

export function OrderForm() {
  const [form, setForm] = useState<OrderFormData>({
    name: '',
    email: '',
    material: '',
    description: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = () => {
    setForm({ name: '', email: '', material: '', description: '' });
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="confirmation"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
          className="max-w-lg mx-auto text-center py-20"
        >
          {/* Geometric checkmark — laser-cut diamond */}
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
            className="w-20 h-20 mx-auto mb-10 geo-diamond bg-amber/20 border border-amber flex items-center justify-center"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FF5C00"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />
            </svg>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="font-display text-heading text-[#FAFAFA] mb-4"
          >
            We&apos;ve got your specs.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="text-text-secondary text-body-lg mb-10"
          >
            We&apos;ll review your design and get back within 24 hours with a quote
            and timeline.
          </motion.p>

          

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button onClick={resetForm} className="btn-primary">
              <span>Submit Another</span>
            </button>
            <a href="/" className="btn-primary btn-primary-filled">
              <span>Go Home</span>
            </a>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.form
      key="form"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto"
    >
      <div className="space-y-8">
        {/* Name */}
        <div>
          <label htmlFor="name" className="form-label">
            01 — Your Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={form.name}
            onChange={handleChange}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            placeholder="What should we call you?"
            className="form-input laser-focus"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="form-label">
            02 — Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            value={form.email}
            onChange={handleChange}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            placeholder="Where can we reach you?"
            className="form-input laser-focus"
          />
        </div>

        {/* Material */}
        <div>
          <label htmlFor="material" className="form-label">
            03 — Material
          </label>
          <select
            id="material"
            name="material"
            required
            value={form.material}
            onChange={handleChange}
            onFocus={() => setFocused('material')}
            onBlur={() => setFocused(null)}
            className="form-input laser-focus appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%238A8078%22%20stroke-width%3D%221.5%22%20d%3D%22M1%201l5%205%205-5%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_8px] bg-[right_1.25rem_center] bg-no-repeat"
          >
            {MATERIAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-surface-raised text-[#FAFAFA]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="form-label">
            04 — Design Details
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            value={form.description}
            onChange={handleChange}
            onFocus={() => setFocused('description')}
            onBlur={() => setFocused(null)}
            placeholder="Describe what you want cut — dimensions, quantity, material specifics. Attach files if you have them."
            className="form-input laser-focus resize-none"
          />
        </div>

        {/* Submit */}
        <button type="submit" className="btn-primary btn-primary-filled w-full justify-center">
          <span>Send to Paberin</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 8h14M9 3l5 5-5 5" />
          </svg>
        </button>
      </div>
    </motion.form>
  );
}
