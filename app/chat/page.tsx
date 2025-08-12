'use client';
import { useSearchParams } from 'next/navigation';
import ChatWindow from '@/components/ChatWindow';

export default function ChatPage() {
  const sp = useSearchParams();
  const roomId = sp.get('roomId') || '';
  if (!roomId) return <div className="p-6">roomId がありません</div>;
  return (
    <main className="min-h-screen p-6">
      <h2 className="text-xl mb-3">ルーム: {roomId}</h2>
      <ChatWindow roomId={roomId} />
    </main>
  );
}
