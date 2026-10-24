// Browsing load: many shoppers looking at the shop (home, categories, products, search). Read-only.
import { browse, DURATION, publicProducts, VUS } from './lib.js'

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: VUS }, // ramp up
        { duration: DURATION, target: VUS }, // hold
        { duration: '10s', target: 0 }, // ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration{expected_response:true}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  return { products: publicProducts() }
}

export default function (data) {
  browse(data.products)
}

export { handleSummary } from './lib.js'
