// components/AdBox.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    /** AdSense のキュー（スクリプト読込前でも push できる） */
    adsbygoogle?: unknown[];
  }
}

type Props = {
  /** 例: "5217313790" */
  slotId: string;
  /** 例: "ca-pub-5996393131507547" */
  clientId: string;
  /** PR プレビュー等は true（テスト広告） */
  test?: boolean;
  className?: string;
  /**
   * ラッパー側で確保する最低高さ（px）
   * 0 の場合はプレースホルダーを出しません
   */
  reserveMinHeight?: number;
};

/**
 * レスポンシブ表示のディスプレイ広告。
 * 高さは <ins> に与えず、外側ラッパーで確保します。
 * - スクリプトは clientId ごとに 1 回だけ読み込み
 * - 同一 <ins> への多重 push を避ける（TagError 回避）
 * - data-ad-status を監視して filled/unfilled を UI 反映
 */
export default function AdBox({
  slotId,
  clientId,
  test = false,
  className,
  reserveMinHeight = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pushedRef = useRef(false); // 同一 <ins> への多重 push を防止
  const [status, setStatus] = useState<'init' | 'filled' | 'unfilled'>('init');

  // --- adsbygoogle.js を読み込み（重複ロード回避） ---
  useEffect(() => {
    const id = `adsbygoogle-js-${clientId}`;
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        clientId,
      )}`;
      document.head.appendChild(s);
    }
  }, [clientId]);

  // --- スロット初期化（slotId/clientId/test が変わったらやり直し） ---
  useEffect(() => {
    pushedRef.current = false;
    setStatus('init');

    const el = hostRef.current?.querySelector('ins.adsbygoogle') as HTMLElement | null;
    if (!el) return;

    // data-ad-status 変化を監視（filled / unfilled）
    const observer = new MutationObserver(() => {
      const s = el.getAttribute('data-ad-status');
      if (s === 'filled' || s === 'unfilled') {
        setStatus(s as 'filled' | 'unfilled');
      }
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'],
    });

    // すでに処理済み（data-adsbygoogle-status=done）なら push 不要
    const processed = el.getAttribute('data-adsbygoogle-status') === 'done';

    const pushOnce = () => {
      if (pushedRef.current) return;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // 同一要素への再 push などで throw されるが、無視してよい
      } finally {
        pushedRef.current = true;
      }
    };

    if (!processed) pushOnce();

    // 念のため 5 秒後に最終ステータスを読むフォールバック
    const fallback = window.setTimeout(() => {
      const s = el.getAttribute('data-ad-status');
      if (s === 'filled' || s === 'unfilled') {
        setStatus(s as 'filled' | 'unfilled');
      }
    }, 5000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [slotId, clientId, test]);

  return (
    <div
      ref={hostRef}
      className={className}
      // プレースホルダーの絶対配置先になるため relative を付与
      style={{ minHeight: reserveMinHeight || 0, position: 'relative', width: '100%' }}
    >
      {/* プレースホルダー（無配信 or 読み込み中のみ可視） */}
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
            pointerEvents: 'none', // 広告クリックの邪魔をしない
          }}
        >
          <span style={{ fontSize: 12, color: '#93c5fd' }}>
            {status === 'unfilled' ? '広告枠（無配信）' : '広告枠（読み込み中）'}
          </span>
        </div>
      )}

      {/* slot/client/test が変わったら要素自体を作り直すために key を付与 */}
      <ins
        key={`${clientId}-${slotId}-${test ? 't' : 'p'}`}
        className="adsbygoogle"
        style={{ display: 'block' }} // 高さは与えない（ラッパー側で確保）
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
        {...(test ? { 'data-adtest': 'on' } : {})}
      />
    </div>
  );
}
