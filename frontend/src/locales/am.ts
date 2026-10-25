import { account } from './am/account'
import { core } from './am/core'
import { messages } from './am/messages'
import { services } from './am/services'

/**
 * Amharic. Key = the English text exactly as written in the code; value = Amharic. A missing line shows in English.
 * One file per area (./am/*) so several people can translate at once.
 * First draft: please have a native speaker review it before launch (docs/MARKETPLACE_ROADMAP.md, M18).
 */
export const am: Record<string, string> = { ...core, ...account, ...messages, ...services }
