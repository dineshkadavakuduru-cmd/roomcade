import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="font-display text-7xl font-black tracking-tight">
        <span style={{ background: 'linear-gradient(135deg,#FF6B35,#FF3D81)', WebkitBackgroundClip: 'text', color: 'transparent' }}>404</span>
      </div>
      <p className="font-display text-xl font-extrabold">This arcade cabinet is empty.</p>
      <p className="text-sm text-white/60">The room code in the URL does not match any game on this machine.</p>
      <Link href="/" className="btn-neon mt-2 rounded-full px-6 py-3 font-display font-extrabold">
        Back to the lobby
      </Link>
    </main>
  );
}
