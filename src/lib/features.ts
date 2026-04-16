// Grantable feature definitions for v2.3 permission system
// super_admin always has all features
// Regular users see all grantable items in sidebar but need to be granted access

export type FeatureKey =
  | 'tags'
  | 'unassigned_notes'
  | 'email_templates'
  | 'prompts'
  | 'countries'
  | 'newsletter'
  | 'failed_scans'
  | 'duplicates'
  | 'camcard'
  | 'trash'
  | 'export_contacts'
  | 'bulk_email'

export const FEATURE_ROUTES: Record<FeatureKey, string> = {
  tags: '/admin/tags',
  unassigned_notes: '/unassigned-notes',
  email_templates: '/admin/templates',
  prompts: '/admin/prompts',
  countries: '/admin/countries',
  newsletter: '/admin/newsletter',
  failed_scans: '/admin/failed-scans',
  duplicates: '/admin/duplicates',
  camcard: '/admin/camcard',
  trash: '/admin/trash',
  export_contacts: '/contacts',
  bulk_email: '/email/compose',
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  tags: '標籤管理',
  unassigned_notes: '未分配筆記',
  email_templates: 'Email 範本',
  prompts: 'Prompt 管理',
  countries: '國家管理',
  newsletter: 'Newsletter',
  failed_scans: '辨識失敗審查',
  duplicates: '重複聯絡人',
  camcard: '名片匯入',
  trash: '資源回收桶',
  export_contacts: '匯出聯絡人',
  bulk_email: '群發郵件（20人以上）',
}

export const ALL_FEATURE_KEYS = Object.keys(FEATURE_ROUTES) as FeatureKey[]

/** Check if a user has access to a feature */
export function hasFeature(
  role: string,
  grantedFeatures: string[],
  feature: FeatureKey
): boolean {
  if (role === 'super_admin') return true
  return grantedFeatures.includes(feature)
}

/** Map a pathname to its feature key (if it's a grantable route) */
export function pathToFeature(pathname: string): FeatureKey | null {
  for (const [key, route] of Object.entries(FEATURE_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return key as FeatureKey
    }
  }
  return null
}
