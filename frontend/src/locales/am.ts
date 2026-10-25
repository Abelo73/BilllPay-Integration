import { account } from './am/account'
import { core } from './am/core'
import { cv } from './am/cv'
import { messages } from './am/messages'
import { orders } from './am/orders'
import { services } from './am/services'
import { shop } from './am/shop'
import { work } from './am/work'

/**
 * Amharic. Key = the English text exactly as written in the code; value = Amharic. A missing line shows in English.
 * One file per area (./am/*) so several people can translate at once.
 * First draft: please have a native speaker review it before launch (docs/MARKETPLACE_ROADMAP.md, M18).
 */
export const am: Record<string, string> = { ...core, ...account, ...messages, ...services, ...shop, ...orders, ...work, ...cv }
