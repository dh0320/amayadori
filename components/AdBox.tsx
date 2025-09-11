'use client';

import { useEffect } from 'react';

type Props = {
  client: string;           // 例: "ca-pub-1234567890123456"
  slot: string;             // 例: "1234567890"
  style?: React.CSSProperties; // 幅高さなど
};

export default function AdBox({ client, slot, style }: Props) {
  const isTest = process.env.NEXT_PUBLIC_ADS_TEST === '1';

  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, [client, slot, isTest]);

  return (
    <>
      {/* AdSense ライブラリ（複数箇所で重複読込してもOK） */}
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
      />

      {/* 手動ユニット（テスト時は data-adtest="on" を付与） */}
      <ins
        className="adsbygoogle"
        style={style || { display: 'block', minHeight: 90 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        {...(isTest ? { 'data-adtest': 'on' } : {})}
      />
      <script dangerouslySetInnerHTML={{ __html: '(adsbygoogle = window.adsbygoogle || []).push({});' }} />
    </>
  );
}
