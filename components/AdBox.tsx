// components/AdBox.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  slotId: string;               // 例: "5217313790"
  clientId: string;             // 例: "ca-pub-5996393131507547"
  test?: boolean;               // PRプレビューなどは true
  className?: string;
  reserveMinHeight?: number;    // 枠のための“最低高さ”をラッパー側で確保（デフォルト 0）
};

/**
 * レスポンシブ表示のディスプレイ広告。
 * 高さは <ins> に与えず、外側ラッパーで確保します。
 */
export default function AdBox({
  slotId,
  clientId,
  test = false,
  className,
  reserveMinHeight = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'init' | 'filled' | 'unfilled'>('init');

  // adsbygoogle.js を読み込み（重複ロードは回避）
  useEffect(() => {
    const id = `adsbygoogle-js-${clientId}`;
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      document.head.appendChild(s);
    }
  }, [clientId]);

  // スロット初期化
  useEffect(() => {
    const el = hostRef.current?.querySelector('ins.adsbygoogle') as HTMLElement | null;
    if (!el) return;

    // 既に filled/unfilled が付いている場合は再初期化のため一旦外す
    el.removeAttribute('data-adsbygoogle-status');
    el.removeAttribute('data-ad-status');

    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // 同一要素への多重 push 回避用
      console.warn('adsbygoogle push error (ignored):', e);
    }

    // 状態ポーリング（filled / unfilled）
    const t = setInterval(() => {
      const st = el.getAttribute('data-ad-status');
      if (st === 'filled' || st === 'unfilled') {
        setStatus(st as 'filled' | 'unfilled');
        clearInterval(t);
      }
    }, 400);

    return () => clearInterval(t);
  }, [slotId, clientId]);

  return (
    <div
      ref={hostRef}
      className={className}
      // 高さの確保はラッパーで。<ins> は高さ指定しない。
      style={{ minHeight: reserveMinHeight || 0 }}
    >
      {/* プレースホルダー（無配信時は残る） */}
      {reserveMinHeight > 0 && status !== 'filled' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              status === 'unfilled' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 12, color: '#93c5fd' }}>
            {status === 'unfilled' ? '広告枠（無配信）' : '広告枠（読み込み中）'}
          </span>
        </div>
      )}

      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}                       // ← 高さは与えない！
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
        {...(test ? { 'data-adtest': 'on' } : {})}
      />
    </div>
  );
}
