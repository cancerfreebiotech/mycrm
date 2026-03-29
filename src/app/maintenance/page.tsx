export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 text-center px-6">
      <div className="text-6xl mb-6">🔧</div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        系統維護中
      </h1>
      <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">
        System Maintenance
      </p>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-4">
        請稍後再試。如有急需請聯絡管理員。
      </p>
    </div>
  )
}
