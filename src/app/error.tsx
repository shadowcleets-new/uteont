"use client";

// Root error boundary (N-04): any uncaught render/runtime error in the app tree
// lands here — inside the app shell — with a Try-again that re-renders the
// segment, instead of Next's bare default error screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[22px] font-semibold text-[#141413]">Something went wrong</h1>
      <p className="max-w-md text-sm text-[#6b6b6b]">
        An unexpected error occurred. You can try again, or head back to the dashboard.
      </p>
      {error.digest && <p className="text-xs text-[#9a9a9a]">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-[#d97757] px-4 py-2 text-sm font-medium text-white transition-transform active:scale-95"
        >
          Try again
        </button>
        {/* Deliberate <a> (not <Link>): a full-page load escapes a broken React
            tree, which client-side navigation could re-render right back into. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="rounded-md border border-[#e3e1da] px-4 py-2 text-sm font-medium text-[#141413] hover:bg-[#f0eee8]"
        >
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
