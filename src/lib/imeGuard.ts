// IME（注音／日文假名等）組字期間按 Enter 是「選字確認」，不可觸發送出／提交。
//
// 瀏覽器行為差異：
// - Chrome / Firefox / Edge：選字確認的 keydown 帶 isComposing=true（或 keyCode 229），
//   之後才觸發 compositionend → 檢查 isComposing 即可。
// - Safari（WebKit bug 165004）：compositionend 先於該次 keydown 觸發，keydown 的
//   isComposing 已是 false、keyCode 是 13 → 以全域 compositionend 時間戳補判：
//   30ms 內接著到的 Enter 視為選字確認（真人連按兩下 Enter 不可能快於 30ms）。
//
// 用法：Enter 送出的 onKeyDown 中，先呼叫 isImeComposing(e)，true 就直接 return。

let lastCompositionEnd = 0

if (typeof document !== 'undefined') {
  // capture 階段全域監聽一次即可——同一時間只會有一個輸入法在組字。
  document.addEventListener(
    'compositionend',
    () => {
      lastCompositionEnd = Date.now()
    },
    true,
  )
}

export function isImeComposing(e: { nativeEvent: Event }): boolean {
  const ne = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number }
  return ne.isComposing === true || ne.keyCode === 229 || Date.now() - lastCompositionEnd < 30
}
