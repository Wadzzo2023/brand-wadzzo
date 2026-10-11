"use client";

import { api } from "~/utils/api";

/** Mark read / unread / delete, then refresh the lists and the badge. */
export function useInboxActions() {
  const utils = api.useUtils();
  const refresh = () => Promise.all([utils.fan.notification.inbox.invalidate(), utils.fan.notification.inboxUnread.invalidate(), utils.fan.notification.inboxUnreadByCategory.invalidate()]);
  const opts = { onSuccess: () => void refresh() };
  return {
    markRead: api.fan.notification.markRead.useMutation(opts),
    markUnread: api.fan.notification.markUnread.useMutation(opts),
    markAllRead: api.fan.notification.markAllRead.useMutation(opts),
    remove: api.fan.notification.remove.useMutation(opts),
    clearRead: api.fan.notification.clearRead.useMutation(opts),
  };
}
