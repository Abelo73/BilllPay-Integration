import { adminToken } from '@/lib/admin-api'
import { ApiError, type Page } from '@/lib/api'
import { openPrivateFile, type CvOrder, type JobView, type Profile } from '@/lib/work-api'

export type AdminJob = {
  job: JobView
  status: 'PENDING' | 'LIVE' | 'REJECTED' | 'CLOSED'
  statusNote: string | null
  employerPhone: string | null
  decidedBy: string | null
  decidedAt: string | null
}

export type AdminCvOrder = { order: CvOrder; customerName: string | null; customerPhone: string | null; profileId: number | null }
export type AdminStudent = { profile: Profile; studentStatus: string; idFileId: number | null }
export type WorkCounts = { jobsPending: number; cvOrdersOpen: number; studentsWaiting: number }

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const token = adminToken.get()
  const res = await fetch(`/api/admin/work${path}`, {
    ...init,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    headers: {
      ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401) {
    adminToken.clear()
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`)
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<T>
}

export const workAdminApi = {
  counts: () => request<WorkCounts>('/counts'),
  jobs: (status: string, page = 0) => request<Page<AdminJob>>(`/jobs?status=${status}&page=${page}`),
  decideJob: (id: number, body: { status?: string; note?: string; markPaid?: boolean; featured?: boolean }) =>
    request<AdminJob>(`/jobs/${id}`, { method: 'POST', json: body }),

  cvOrders: (show: 'open' | 'unpaid' | 'done', page = 0) => request<Page<AdminCvOrder>>(`/cv-orders?show=${show}&page=${page}`),
  cvAction: (id: number, body: { action: 'paid' | 'writing' | 'cancel'; reference?: string; writer?: string; note?: string }) =>
    request<AdminCvOrder>(`/cv-orders/${id}`, { method: 'POST', json: body }),
  cvUpload: (id: number, kind: 'DRAFT' | 'FINAL', file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<AdminCvOrder>(`/cv-orders/${id}/files?kind=${kind}`, { method: 'POST', body: form })
  },
  openCvFile: (id: number, fileId: number) => openPrivateFile(`/admin/work/cv-orders/${id}/files/${fileId}`, adminToken.get()),
  profile: (id: number) => request<Profile>(`/profiles/${id}`),

  students: (status = 'SUBMITTED', page = 0) => request<Page<AdminStudent>>(`/students?status=${status}&page=${page}`),
  decideStudent: (profileId: number, approve: boolean, note?: string) =>
    request<{ studentStatus: string }>(`/students/${profileId}`, { method: 'POST', json: { approve, note } }),
  openFile: (fileId: number) => openPrivateFile(`/admin/work/files/${fileId}`, adminToken.get()),
  featureTalent: (profileId: number, days: number) => request<{ featuredUntil: string }>(`/profiles/${profileId}/feature`, { method: 'POST', json: { days } }),
}
