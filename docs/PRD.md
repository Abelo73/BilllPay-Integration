# Product Requirements Document (PRD)

**Product:** TenaShop
**Version:** 0.1 (draft) · **Date:** 2026-10-22
**Related:** [BRD](BRD.md) · [SRS](SRS.md) · [TRD](TRD.md)

---

## 1. Product summary

TenaShop is a modern online store whose main purpose is to exercise the **BillPay** payment gateway. It looks and behaves like a real shop (landing page, catalog, cart, checkout). It also has an admin area that shows exactly what happened between the shop and BillPay for every order.

## 2. Personas

| Persona | Goal |
|---------|------|
| **Shopper** | Browse, add to cart, pay with BillPay, see confirmation |
| **Admin / Tester** | Watch payments, inspect webhooks, refund, run sandbox scenarios |

## 3. User stories

### Shopper
| ID | Story | Priority |
|----|-------|----------|
| US-1 | I see an attractive landing page that explains the store and highlights products | Must |
| US-2 | I browse products by category and search by name | Must |
| US-3 | I view product details (images, price in ETB, stock) | Must |
| US-4 | I add, update and remove items in my cart, and it survives a page refresh | Must |
| US-5 | I check out by entering my name, phone and email | Must |
| US-6 | I am sent to BillPay to pay with Wallet, Bank or Card | Must |
| US-7 | After paying I return to the shop and see the real status: Paid, Pending, Failed or Expired | Must |
| US-8 | If I cancel at BillPay, I come back and can retry payment | Must |
| US-9 | If payment failed, I see a clear reason (e.g. insufficient funds) and can retry | Should |
| US-10 | I can look up an order with my order number and phone | Should |

### Admin / Tester
| ID | Story | Priority |
|----|-------|----------|
| US-20 | I log in to an admin area | Must |
| US-21 | I see orders with status, amount, customer and payment reference | Must |
| US-22 | I open an order and see its timeline: created → payment requested → webhook(s) → final state | Must |
| US-23 | I see the raw webhook log (payload, signature valid?, processed?, duplicate?) | Must |
| US-24 | I can trigger "re-check status with BillPay" for a pending payment | Must |
| US-25 | I can refund an order, fully or partially | Should |
| US-26 | I see a sandbox cheat sheet of test values and expected outcomes | Should |
| US-27 | I manage products (create, edit, stock) | Could |
| US-28 | Dashboard KPIs: revenue, success rate, failures by reason code | Could |

## 4. Pages and screens

### Public
1. **Landing page** (`/`), modern design:
   - Hero with headline, call to action and product imagery
   - "Featured products" grid
   - "How it works" (Browse → Pay with BillPay → Delivered)
   - Trust strip: secure payments by BillPay, with Wallet, Bank and Card badges
   - Testimonials, FAQ (accordion), newsletter, footer
   - Dark/light mode, responsive, subtle animations
2. **Shop** (`/shop`): grid, category filter, search, sort
3. **Product detail** (`/product/:slug`)
4. **Cart** (`/cart`), plus a slide-over cart drawer
5. **Checkout** (`/checkout`): contact form and order summary, then "Pay with BillPay"
6. **Payment return** (`/checkout/return`): polls order status and shows success, pending or failure
7. **Payment cancelled** (`/checkout/cancelled`): retry option
8. **Order lookup** (`/orders/track`)

### Admin (`/admin`)
1. Login
2. Dashboard (KPIs)
3. Orders list, then order detail with timeline and refund
4. Payments list
5. Webhook events log
6. Refunds
7. Products
8. Sandbox scenarios (cheat sheet)

## 5. Key flows

### 5.1 Checkout and payment
1. Shopper clicks **Pay with BillPay**.
2. Backend creates the order (`PENDING_PAYMENT`), reserves stock, and calls BillPay *create payment* with an Idempotency-Key.
3. Backend returns the BillPay **checkout URL**, and the browser redirects there.
4. Shopper pays on BillPay.
5. BillPay sends a **webhook**, and BillPay redirects the shopper to `returnUrl`.
6. The return page polls the backend until the status is final.
7. Order becomes `PAID`, the confirmation shows, and an `order.paid` event goes to Kafka.

### 5.2 Edge cases the product must handle
- Shopper returns before the webhook arrives: the page shows **"Confirming your payment…"** and keeps polling.
- Webhook never arrives: a background reconciliation job queries BillPay.
- Payment stays pending and then expires: the order becomes `EXPIRED` and stock is released.
- Duplicate webhook: processed once, logged as a duplicate.
- Double-click on Pay: only one BillPay payment is created.

## 6. Design requirements (UI)

- **shadcn/ui** components on Tailwind CSS, with **lucide-react** icons
- Clean, modern look with a fintech feel. The palette follows the BillPay navy/blue brand so the hand-off feels continuous, plus the TenaShop accent color.
- Mobile-first and responsive. Lighthouse accessibility ≥ 90.
- Loading skeletons, toast notifications (sonner), empty states
- Visible "**Sandbox mode**" banner while using test keys (same idea as the BillPay dashboard)

## 7. Acceptance criteria (release 1)

- [ ] All **Must** stories implemented
- [ ] All sandbox scenarios in [TEST_PLAN.md](TEST_PLAN.md) pass
- [ ] `docker compose up` starts the whole stack on the non-default ports
- [ ] No secrets in the frontend bundle or in git
- [ ] Switching to live needs only `.env` changes

## 8. Success metrics

- Checkout → BillPay redirect in under 2 seconds (sandbox)
- 0 orders marked paid without BillPay confirmation
- 0 double charges in duplicate/double-click tests
