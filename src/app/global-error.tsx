"use client";

// Layout-level error boundary (N-04): catches errors thrown by the root layout
// itself, which error.tsx cannot reach. Must render its own <html>/<body>, and
// uses inline styles since the app shell (and its CSS) is what failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", background: "#faf9f5", color: "#141413", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#6b6b6b", maxWidth: 420 }}>
            The app hit an unexpected error. Please try again.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: "#9a9a9a" }}>Reference: {error.digest}</p>}
          <button
            onClick={reset}
            style={{
              background: "#d97757",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "0.5rem 1rem",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
