import fs from 'fs';

const additions = {
  health: {
    checking: { 'zh-TW': '檢查中...', en: 'Checking...', ja: 'チェック中...' },
    checkNow: { 'zh-TW': '立即檢查', en: 'Check now', ja: '今すぐチェック' },
    servicesDown: {
      'zh-TW': '⚠️ {count} 個服務異常',
      en: '⚠️ {count} service(s) down',
      ja: '⚠️ {count} 件のサービスに異常',
    },
    allHealthy: {
      'zh-TW': '✅ 所有服務運作正常',
      en: '✅ All services healthy',
      ja: '✅ すべてのサービスが正常に稼働',
    },
    checkingStatus: {
      'zh-TW': '正在檢查各服務狀態...',
      en: 'Checking service status...',
      ja: 'サービスのステータスを確認中...',
    },
    latencyLegend: {
      'zh-TW': '延遲指示燈說明',
      en: 'Latency indicator legend',
      ja: '遅延インジケーターの説明',
    },
    latencyNormal: {
      'zh-TW': '< 500 ms — 正常',
      en: '< 500 ms — Normal',
      ja: '< 500 ms — 正常',
    },
    latencySlow: {
      'zh-TW': '500–2000 ms — 緩慢',
      en: '500–2000 ms — Slow',
      ja: '500–2000 ms — 遅い',
    },
    latencyCritical: {
      'zh-TW': '> 2000 ms — 異常慢',
      en: '> 2000 ms — Critical',
      ja: '> 2000 ms — 異常に遅い',
    },
  },
};

const locales = ['zh-TW', 'en', 'ja'];

for (const locale of locales) {
  const p = `src/messages/${locale}.json`;
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  let added = 0;
  for (const ns in additions) {
    if (!json[ns]) json[ns] = {};
    for (const k in additions[ns]) {
      if (json[ns][k] !== undefined) continue;
      json[ns][k] = additions[ns][k][locale];
      added++;
    }
  }
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`${locale}: added ${added}`);
}
