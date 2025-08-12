'use client';
import { ensureAnon, auth } from '@/lib/firebase';

export default function EnterButton() {
  async function onClick() {
    await ensureAnon();

    // 位置情報
    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true,
      })
    );

    // ←ここを修正：動的importではなく currentUser から直接取得
    const idToken = await auth.currentUser!.getIdToken();

    const ENTER_URL = process.env.NEXT_PUBLIC_FUNCTIONS_ENTER_URL!;
    const r = await fetch(ENTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        regionChoice: 'country',
      }),
    }).then((r) => r.json());

    if (r.roomId) location.href = `/chat?roomId=${r.roomId}`;
    else alert(r.reason ?? '待機に入りました。相手が見つかると入室します。');
  }

  return (
    <button onClick={onClick} className="px-4 py-2 rounded bg-black text-white">
      入室する
    </button>
  );
}
