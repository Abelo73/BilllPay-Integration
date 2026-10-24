import { request, type Page } from '@/lib/api'

export type Review = {
  id: number
  productId: number
  productName: string | null
  rating: number
  body: string | null
  /** e.g. "Hana G." */
  authorName: string
  createdAt: string
  sellerReply: string | null
  repliedAt: string | null
  hidden: boolean
  hiddenReason: string | null
}

export type ReviewSummary = { average: number | null; count: number; stars: Record<string, number> }

export type ReviewPage = { summary: ReviewSummary; reviews: Page<Review> }

export type Reviewable = {
  orderItemId: number
  orderNumber: string
  productId: number
  productName: string
  productSlug: string | null
  imageUrl: string | null
  deliveredAt: string | null
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const reviewApi = {
  product: (productId: number, page = 0) => request<ReviewPage>(`/products/${productId}/reviews?page=${page}`),
  shop: (slug: string, page = 0) => request<ReviewPage>(`/shops/${encodeURIComponent(slug)}/reviews?page=${page}`),
  reviewable: () => request<Reviewable[]>('/me/reviewable'),
  create: (orderItemId: number, rating: number, body?: string) => request<Review>('/reviews', post({ orderItemId, rating, body })),
  mine: (page = 0) => request<ReviewPage>(`/seller/reviews?page=${page}`),
  reply: (id: number, text: string) => request<Review>(`/seller/reviews/${id}/reply`, post({ text })),
}
