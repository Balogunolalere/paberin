import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#666666] mb-6">
        Error 404
      </p>

      <h1 className="text-2xl sm:text-3xl md:text-6xl font-bold text-black leading-[1.1] max-w-[37.5rem] mx-auto">
        Page not found<span className="text-[#FF5C00]">.</span>
      </h1>

      <p className="text-base text-[#666666] max-w-[27.5rem] mx-auto mt-6 leading-relaxed">
        The page you&apos;re looking for doesn&apos;t exist. It may have been moved,
        or never was. Check the URL or head back home.
      </p>

      <div className="mt-10 flex justify-center gap-4 flex-wrap">
        <Link href="/" className="btn-primary">
          Back to Home
        </Link>
        <Link href="/order" className="btn-outline">
          Start an Order
        </Link>
      </div>
    </div>
  );
}
