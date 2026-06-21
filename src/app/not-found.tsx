import Link from "next/link";

// Root not-found boundary (N-04): notFound() calls and unknown routes render
// here, inside the app shell, instead of Next's unstyled default 404.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[22px] font-semibold text-[#141413]">Page not found</h1>
      <p className="max-w-md text-sm text-[#6b6b6b]">
        That page doesn&rsquo;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="rounded-md bg-[#d97757] px-4 py-2 text-sm font-medium text-white transition-transform active:scale-95"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
