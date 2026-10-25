import { ApiError, request, type Page } from '@/lib/api'
import { sessionToken } from '@/store/session'

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'CONTRACT'
export const JOB_TYPE_LABEL: Record<JobType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
}

export type TalentStatus = 'STUDENT' | 'GRADUATE' | 'LOOKING' | 'WORKING_OPEN'
export const TALENT_STATUS_LABEL: Record<TalentStatus, string> = {
  STUDENT: 'Student',
  GRADUATE: 'Graduate',
  LOOKING: 'Looking for work',
  WORKING_OPEN: 'Working, open to offers',
}

export const WORK_TYPES = ['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'WEEKEND'] as const
export const WORK_PLACES = ['SODO', 'NEARBY', 'REMOTE'] as const
export const WORK_PLACE_LABEL: Record<(typeof WORK_PLACES)[number], string> = { SODO: 'In Sodo', NEARBY: 'Nearby towns', REMOTE: 'Remote' }

export type JobView = {
  id: number
  title: string
  employerName: string
  place: string
  type: JobType
  field: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryNote: string | null
  description: string
  requirements: string | null
  deadline: string
  featured: boolean
  postedAt: string
  /** owner only */
  status: 'PENDING' | 'LIVE' | 'REJECTED' | 'CLOSED' | null
  statusNote: string | null
  fee: number | null
  feePaid: boolean
  applied: boolean
  applications: number
}

export type FileKind = 'CERTIFICATE' | 'CV_UPLOAD' | 'CV_PRO' | 'STUDENT_ID'
export type TalentFile = { id: number; kind: FileKind; fileName: string; contentType: string; sizeBytes: number; createdAt: string }
export type Experience = { title: string; place: string | null; startMonth: string | null; endMonth: string | null; description: string | null }

export type Profile = {
  id: number
  fullName: string
  status: TalentStatus
  headline: string | null
  about: string | null
  school: string | null
  fieldOfStudy: string | null
  graduationYear: number | null
  skills: string[]
  languages: string[]
  workTypes: string[]
  workPlaces: string[]
  publicProfile: boolean
  studentStatus: 'NONE' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | null
  studentNote: string | null
  verifiedStudent: boolean
  experience: Experience[]
  files: TalentFile[]
  phone: string | null
  updatedAt: string
}

export type ProfileInput = {
  fullName: string
  status: TalentStatus
  headline?: string
  about?: string
  school?: string
  fieldOfStudy?: string
  graduationYear?: number | null
  skills: string[]
  languages: string[]
  workTypes: string[]
  workPlaces: string[]
  publicProfile: boolean
  experience: Experience[]
}

export type AppStatus = 'NEW' | 'SHORTLISTED' | 'INTERVIEW' | 'HIRED' | 'NOT_SELECTED'
export const APP_STATUS_LABEL: Record<AppStatus, string> = {
  NEW: 'Sent',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  HIRED: 'Hired',
  NOT_SELECTED: 'Not selected',
}

export type Application = {
  id: number
  status: AppStatus
  cvKind: 'AUTO' | 'FILE'
  cvFileId: number | null
  message: string | null
  createdAt: string
  job: JobView | null
  applicant: Profile | null
}

export type JobInput = {
  employerName: string
  title: string
  place: string
  type: JobType
  field?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryNote?: string
  description: string
  requirements?: string
  deadline: string
}

export type CvPack = 'BASIC' | 'COVER' | 'PREMIUM'
export type CvStatus = 'AWAITING_PAYMENT' | 'PAID' | 'WRITING' | 'DRAFT_SENT' | 'CHANGES' | 'DONE' | 'CANCELLED'
export const CV_STATUS_LABEL: Record<CvStatus, string> = {
  AWAITING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid, in the queue',
  WRITING: 'Being written',
  DRAFT_SENT: 'Draft ready for you',
  CHANGES: 'Making your changes',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}
export const CV_PACK_LABEL: Record<CvPack, string> = { BASIC: 'CV', COVER: 'CV + cover letter', PREMIUM: 'Premium' }

export type CvQuote = {
  pack: CvPack
  express: boolean
  price: number
  expressFee: number
  discountPercent: number
  total: number
  days: number
  changesAllowed: number
}

export type CvOrderFile = { id: number; kind: 'CUSTOMER' | 'DRAFT' | 'FINAL'; fileName: string; contentType: string; sizeBytes: number; createdAt: string }

export type CvOrder = {
  id: number
  pack: CvPack
  express: boolean
  language: 'EN' | 'AM' | 'BOTH'
  price: number
  discountPercent: number
  total: number
  status: CvStatus
  targetJob: string | null
  details: string | null
  paymentReference: string | null
  writer: string | null
  changesAllowed: number
  changesUsed: number
  changeRequest: string | null
  dueAt: string | null
  paidAt: string | null
  doneAt: string | null
  createdAt: string
  files: CvOrderFile[]
  /** the number to send the money to, while unpaid */
  payTo: string | null
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })
const qs = (p: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const token = sessionToken()
  const res = await fetch(`/api${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json()
}

/** Private files come back with the token and open in a new tab (they're never plain public links). */
export async function openPrivateFile(path: string, token: string | null = sessionToken()) {
  const tab = window.open('', '_blank')
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    tab?.close()
    throw new ApiError(res.status, await res.json().catch(() => ({})))
  }
  const url = URL.createObjectURL(await res.blob())
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const workApi = {
  jobs: (p: { q?: string; type?: JobType | ''; place?: string; page?: number }) => request<Page<JobView>>(`/work/jobs?${qs(p)}`),
  job: (id: number) => request<JobView>(`/work/jobs/${id}`),

  profile: () => request<Profile>('/work/profile'),
  saveProfile: (input: ProfileInput) => request<Profile>('/work/profile', send('PUT', input)),
  deleteProfile: () => request<{ deleted: boolean }>('/work/profile', send('DELETE')),
  addFile: (kind: FileKind, file: File) => upload<Profile>(`/work/profile/files?kind=${kind}`, file),
  removeFile: (id: number) => request<Profile>(`/work/profile/files/${id}`, send('DELETE')),
  openMyFile: (id: number) => openPrivateFile(`/work/profile/files/${id}`),
  profileById: (id: number) => request<Profile>(`/work/profiles/${id}`),
  talent: (p: { q?: string; page?: number }) => request<Page<Profile>>(`/work/talent?${qs(p)}`),

  apply: (jobId: number, body: { cvKind: 'AUTO' | 'FILE'; cvFileId?: number | null; message?: string }) =>
    request<Application>(`/work/jobs/${jobId}/apply`, send('POST', body)),
  myApplications: () => request<Application[]>('/work/applications'),

  postJob: (input: JobInput) => request<JobView>('/work/my-jobs', send('POST', input)),
  myJobs: () => request<JobView[]>('/work/my-jobs'),
  closeJob: (id: number) => request<JobView>(`/work/my-jobs/${id}/close`, send('POST', {})),
  jobApplications: (id: number) => request<Application[]>(`/work/my-jobs/${id}/applications`),
  setStatus: (applicationId: number, status: AppStatus) =>
    request<{ id: number; status: AppStatus }>(`/work/applications/${applicationId}/status`, send('POST', { status })),
  openApplicationCv: (applicationId: number) => openPrivateFile(`/work/applications/${applicationId}/cv`),

  cvQuote: (pack: CvPack, express: boolean) => request<CvQuote>(`/work/cv-orders/quote?${qs({ pack, express })}`),
  orderCv: (body: { pack: CvPack; express: boolean; language: string; targetJob?: string; details?: string }) =>
    request<CvOrder>('/work/cv-orders', send('POST', body)),
  cvOrders: () => request<CvOrder[]>('/work/cv-orders'),
  cvReference: (id: number, reference: string) => request<CvOrder>(`/work/cv-orders/${id}/payment-reference`, send('POST', { reference })),
  cvFile: (id: number, file: File) => upload<CvOrder>(`/work/cv-orders/${id}/files`, file),
  openCvFile: (id: number, fileId: number) => openPrivateFile(`/work/cv-orders/${id}/files/${fileId}`),
  cvRespond: (id: number, approve: boolean, changes?: string) => request<CvOrder>(`/work/cv-orders/${id}/respond`, send('POST', { approve, changes })),
}

export function salaryText(j: Pick<JobView, 'salaryMin' | 'salaryMax' | 'salaryNote'>) {
  const n = (x: number) => x.toLocaleString('en-US')
  const range =
    j.salaryMin && j.salaryMax ? `${n(j.salaryMin)}–${n(j.salaryMax)} birr` : j.salaryMin ? `From ${n(j.salaryMin)} birr` : j.salaryMax ? `Up to ${n(j.salaryMax)} birr` : null
  return [range, j.salaryNote].filter(Boolean).join(' · ') || 'Salary not listed'
}
