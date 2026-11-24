'use client';

import { RoomProgress } from '@/components/RoomProgress';

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl p-4">
      <RoomProgress step="Opening the game…" onRetry={() => location.reload()} />
    </main>
  );
}
