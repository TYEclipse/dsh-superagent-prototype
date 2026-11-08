/** Feishu outbound channel: posts bot messages as new messages in the chat and constructs chat deep links. */
import type { OutboundMessage } from '../core/index.ts'
import { CliError } from '../infra/commands.ts'
import { checkedImText } from '../infra/text.ts'
import type { SourceContext } from './host.ts'
import type { ChannelLink, ChannelLinks } from './kind.ts'
import { feishuTriggerId } from './feishu-trigger.ts'

/** Feishu or Lark AppLink that opens a chat; used when the message's own link was not delivered with the event. */
export const feishuChatLink = (brand: 'feishu' | 'lark', chatId: string): string =>
  `https://applink.${brand === 'lark' ? 'larksuite.com' : 'feishu.cn'}/client/chat/open?openChatId=${encodeURIComponent(chatId)}`
/**
 * True when Feishu permanently refuses a message because the chat can no longer receive one: its ID no longer resolves,
 * as for a dissolved chat, or Feishu reports the chat missing. Only such a Feishu answer means the conversation is gone;
 * timeouts or crashes do not.
 */
const gone = (error: unknown): boolean => error instanceof CliError && error.code !== undefined
  && ((error.code === 230001 && /invalid receive_id/i.test(error.message))
    || (error.code === 230011 && /withdrawn|recalled/i.test(error.message))
    || (Math.floor(error.code / 100) === 2300 && /not found/i.test(error.message)))
/** Posts in the chat as a new message, not a reply under another one; Feishu keeps at most one message per idempotency key (the outgoing message's `message.id`). */
export async function sendFeishu(host: Pick<SourceContext, 'commands'>, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const chatId = message.channel.address.chatId
  if (!chatId) throw new Error('Missing Feishu chat')
  const text = checkedImText(message.text)
  const send = ['im', '+messages-send', '--chat-id', chatId, '--markdown', text, '--idempotency-key', message.id]
  try { await host.commands.lark(send) }
  catch (error) {
    if (gone(error)) return 'gone'
    throw error
  }
  return 'sent'
}
/** Fallback chat link on the bot's brand; the message's own deep link on its Trigger is preferred when available. */
export const feishuLink = (address: Record<string, string>, links: ChannelLinks): ChannelLink => ({
  url: feishuChatLink(links.feishu?.brand ?? 'feishu', address.chatId ?? ''), label: { zh: '飞书消息', en: 'Feishu message' },
  ...address.messageId ? { triggerId: feishuTriggerId(address.messageId) } : {},
})
