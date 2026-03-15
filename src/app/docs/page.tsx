'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Sun, Moon, ArrowLeft } from 'lucide-react'

interface Section {
  id: string
  title: string
  level: number
}

const sections: Section[] = [
  { id: 'user', title: '一般使用者', level: 1 },
  { id: 'login', title: '如何登入', level: 2 },
  { id: 'bind-telegram', title: '綁定 Telegram ID', level: 2 },
  { id: 'bot-commands', title: 'Bot 指令說明', level: 2 },
  { id: 'contacts', title: '管理聯絡人', level: 2 },
  { id: 'notes', title: '筆記與會議紀錄', level: 2 },
  { id: 'email', title: '發送郵件', level: 2 },
  { id: 'tags', title: '使用 Tag 分類', level: 2 },
  { id: 'export', title: 'Export 聯絡人', level: 2 },
  { id: 'personal-settings', title: '個人設定', level: 2 },
  { id: 'admin', title: 'Super Admin', level: 1 },
  { id: 'admin-users', title: '管理使用者角色', level: 2 },
  { id: 'admin-models', title: '管理 AI Endpoint 與 Model', level: 2 },
  { id: 'admin-tags', title: '管理 Tag', level: 2 },
  { id: 'admin-templates', title: '管理郵件範本', level: 2 },
]

export default function DocsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [activeId, setActiveId] = useState('user')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id) })
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            <ArrowLeft size={16} /> 返回系統
          </Link>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">myCRM 使用說明</span>
        </div>
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
      </header>

      <div className="max-w-6xl mx-auto flex gap-8 px-6 py-10">
        {/* TOC */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">目錄</p>
            {sections.map(({ id, title, level }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`block text-sm transition-colors rounded px-2 py-1 ${
                  level === 1 ? 'font-semibold mt-3' : 'pl-4'
                } ${
                  activeId === id
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {title}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <article className="flex-1 min-w-0 prose prose-gray dark:prose-invert max-w-none
          prose-headings:scroll-mt-20 prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base
          prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none">

          {/* ── 一般使用者 ── */}
          <h1 id="user">一般使用者</h1>

          <h2 id="login">如何登入</h2>
          <p>myCRM 使用 Microsoft 帳號（<code>@cancerfree.io</code>）登入，無需另外註冊。</p>
          <ol>
            <li>前往系統網址，點擊「<strong>Sign in with Microsoft</strong>」</li>
            <li>選擇或輸入你的 <code>@cancerfree.io</code> 帳號</li>
            <li>完成 Microsoft 驗證後自動導向 Dashboard</li>
          </ol>
          <blockquote>非 <code>@cancerfree.io</code> 帳號無法登入，會顯示錯誤訊息。</blockquote>

          <h2 id="bind-telegram">綁定 Telegram ID</h2>
          <p>綁定後才能透過 Telegram Bot 掃描名片與記錄筆記。</p>
          <ol>
            <li>在 Telegram 搜尋 <code>@userinfobot</code> 並傳送任意訊息</li>
            <li>Bot 會回覆你的數字 ID（如 <code>123456789</code>）</li>
            <li>前往 <strong>個人設定</strong>（左側選單），將數字 ID 填入「Telegram ID」欄位</li>
            <li>點擊「儲存」，即完成綁定</li>
          </ol>

          <h2 id="bot-commands">Bot 指令說明</h2>
          <p>所有指令均支援完整版與縮寫版：</p>
          <table>
            <thead><tr><th>完整指令</th><th>縮寫</th><th>說明</th></tr></thead>
            <tbody>
              <tr><td><code>/help</code></td><td><code>/h</code></td><td>顯示指令說明</td></tr>
              <tr><td><code>/search [關鍵字]</code></td><td><code>/s [關鍵字]</code></td><td>搜尋聯絡人，顯示名片與快速按鈕</td></tr>
              <tr><td><code>/note</code></td><td>—</td><td>新增筆記或會議記錄</td></tr>
              <tr><td><code>/email</code></td><td><code>/e</code></td><td>發送郵件給聯絡人（需已登入網頁）</td></tr>
              <tr><td><code>/add_back @姓名</code></td><td><code>/ab @姓名</code></td><td>補充名片反面照片</td></tr>
              <tr><td><code>/user</code></td><td><code>/u</code></td><td>列出所有組織成員</td></tr>
            </tbody>
          </table>
          <h3>掃描名片</h3>
          <p>直接傳送名片照片給 Bot，AI 會自動辨識以下欄位：姓名、公司、職稱、Email、電話。辨識完成後顯示結果，點擊「✅ 確認存檔」儲存，或「❌ 不存檔」取消。</p>
          <h3>快速記錄筆記</h3>
          <p>使用 <code>@</code> 快速格式，無需輸入指令：</p>
          <pre><code>@王小明{'\n'}今天拜訪討論了合作方案，下週跟進</code></pre>
          <p>第一行 <code>@姓名</code> 指定聯絡人，第二行起為筆記內容。</p>

          <h2 id="contacts">管理聯絡人</h2>
          <h3>瀏覽與搜尋</h3>
          <p>點擊左側「<strong>聯絡人</strong>」，可依姓名或公司關鍵字搜尋，也可用 Tag 多選篩選。</p>
          <h3>新增聯絡人</h3>
          <ol>
            <li>點擊右上角「<strong>新增聯絡人</strong>」</li>
            <li>可直接填寫表單，或上傳名片照片讓 AI 自動填入</li>
            <li>系統會即時偵測重複聯絡人（相同 Email 或相似姓名）</li>
            <li>選擇 Tag 後點擊「儲存」</li>
          </ol>
          <h3>編輯聯絡人</h3>
          <p>進入聯絡人詳情頁，點擊「<strong>編輯</strong>」按鈕，可修改所有欄位或重新上傳名片照片（AI 重新辨識）。</p>

          <h2 id="notes">筆記與會議紀錄</h2>
          <h3>新增互動紀錄</h3>
          <p>進入聯絡人詳情頁，在「互動紀錄」區塊選擇類型（筆記 / 會議），會議類型可填會議日期，輸入內容後儲存。</p>
          <h3>搜尋筆記</h3>
          <p>點擊左側「<strong>筆記搜尋</strong>」，可依關鍵字、日期範圍、類型（筆記 / 會議 / 郵件）搜尋所有互動紀錄。</p>
          <h3>未歸類筆記</h3>
          <p>Bot 找不到聯絡人時，筆記會存為未歸類。前往「<strong>未歸類筆記</strong>」頁面，點擊「指定聯絡人」即可補充歸類。</p>

          <h2 id="email">發送郵件</h2>
          <h3>從聯絡人詳情頁發信</h3>
          <ol>
            <li>進入聯絡人詳情頁，點擊「<strong>寄信</strong>」</li>
            <li>選擇現有範本，或輸入描述讓 AI 生成內容</li>
            <li>確認主旨與內文後點擊「發送」</li>
            <li>郵件從你的 Microsoft 信箱寄出，並自動記錄於互動紀錄</li>
          </ol>
          <h3>從 Bot 發信</h3>
          <p>輸入 <code>/email</code>（或 <code>/e</code>），依照提示選擇聯絡人、發信方式（Template 或 AI 生成），確認後發送。</p>
          <blockquote>Bot 發信功能需先在網頁登入一次，系統才能取得 Microsoft 授權憑證。</blockquote>

          <h2 id="tags">使用 Tag 分類</h2>
          <p>Tag 可幫助你對聯絡人進行分類（如「客戶」、「潛在客戶」、「合作夥伴」）。</p>
          <ul>
            <li>在聯絡人詳情頁的 Tags 區塊新增或移除 Tag</li>
            <li>在聯絡人列表頁用 Tag 多選篩選</li>
            <li>Dashboard 顯示各 Tag 的聯絡人分布統計</li>
          </ul>

          <h2 id="export">Export 聯絡人</h2>
          <ol>
            <li>前往「<strong>聯絡人</strong>」列表</li>
            <li>可先用關鍵字或 Tag 篩選</li>
            <li>點擊右上角「<strong>Export</strong>」，選擇 Excel（.xlsx）或 CSV 格式下載</li>
          </ol>
          <p>匯出欄位：姓名、公司、職稱、Email、電話、Tags、建立者、建立時間。</p>

          <h2 id="personal-settings">個人設定</h2>
          <p>點擊左側「<strong>個人設定</strong>」可調整：</p>
          <ul>
            <li><strong>Telegram ID</strong>：綁定 Bot 使用權限</li>
            <li><strong>AI OCR 模型</strong>：選擇名片辨識使用的 AI Endpoint 與 Model</li>
            <li><strong>介面主題</strong>：淺色 / 深色</li>
          </ul>

          {/* ── Super Admin ── */}
          <hr />
          <h1 id="admin">Super Admin</h1>
          <p>以下功能僅限 <code>super_admin</code> 角色使用，一般 member 無法進入相關頁面。</p>

          <h2 id="admin-users">管理使用者角色</h2>
          <p>前往「<strong>使用者管理</strong>」，可切換成員的角色（member ↔ super_admin）。</p>
          <blockquote>無法修改自己的角色。第一位 super_admin 需由開發者在 Supabase 手動設定。</blockquote>

          <h2 id="admin-models">管理 AI Endpoint 與 Model</h2>
          <p>前往「<strong>模型管理</strong>」進行兩層式管理：</p>
          <h3>Endpoint 管理</h3>
          <ul>
            <li>新增 Endpoint：填寫名稱、Base URL、API Key</li>
            <li>切換啟用 / 停用：停用後使用者無法選擇該 Endpoint 底下的 Model</li>
            <li>變更 API Key：點擊「變更」重新輸入</li>
            <li>刪除 Endpoint：連同底下所有 Model 一起刪除</li>
          </ul>
          <h3>Model 管理</h3>
          <ul>
            <li>點擊左側 Endpoint 列後，右側顯示該 Endpoint 的 Model 清單</li>
            <li>新增 Model：填寫 Model ID（傳給 API 的字串）和顯示名稱</li>
            <li>切換啟用 / 停用：停用後不出現在個人設定 dropdown</li>
          </ul>

          <h2 id="admin-tags">管理 Tag</h2>
          <p>前往「<strong>Tag 管理</strong>」：</p>
          <ul>
            <li>新增 Tag：輸入名稱後儲存</li>
            <li>編輯名稱：點擊鉛筆圖示</li>
            <li>刪除 Tag：確認後刪除，相關聯的 contact_tags 自動清除</li>
          </ul>

          <h2 id="admin-templates">管理郵件範本</h2>
          <p>前往「<strong>郵件範本</strong>」：</p>
          <ul>
            <li>新增 / 編輯範本：填寫名稱、主旨、HTML 內文</li>
            <li><strong>AI 生成</strong>：在編輯框上方輸入描述，點擊「生成」，AI 自動產生或合併現有內文</li>
            <li>附件管理：上傳附件（單檔限 2MB），發信時附件檔名會記錄於互動紀錄</li>
          </ul>

          <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            myCRM v{process.env.NEXT_PUBLIC_APP_VERSION} · cancerfree.io
          </div>
        </article>
      </div>
    </div>
  )
}
