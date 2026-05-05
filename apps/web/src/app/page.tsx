import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">VibeOps</h1>
      <p className="max-w-md text-muted-foreground/80">
        Project intelligence for AI-built software. Audit, share, and ship with confidence.
      </p>
      <div className="flex gap-3">
        <Link href="/auth/sign-in" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90">
          Sign in
        </Link>
        <a
          href="https://github.com/tdube-architech/VibeOps/releases/latest"
          className="rounded-md border border-border px-4 py-2 font-medium hover:bg-muted"
        >
          Download desktop
        </a>
      </div>
    </main>
  );
}
