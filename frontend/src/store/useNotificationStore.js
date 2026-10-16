import { create } from 'zustand';
import { notificationAPI, getAccessToken } from '../services/api';

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  sseConnection: null,

  loadNotifications: async (page = 1) => {
    set({ isLoading: true });
    try {
      const data = await notificationAPI.getAll(page, 20);
      set({ notifications: data?.notifications || [], unreadCount: data?.unreadCount || 0, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  loadUnreadCount: async () => {
    const count = await notificationAPI.getUnreadCount();
    set({ unreadCount: count });
  },

  markRead: async (id) => {
    await notificationAPI.markRead(id);
    set(s => ({
      notifications: s.notifications.map(n => n._id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await notificationAPI.markAllRead();
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  deleteNotification: async (id) => {
    await notificationAPI.deleteNotification(id);
    set(s => ({
      notifications: s.notifications.filter(n => n._id !== id),
      unreadCount: s.notifications.find(n => n._id === id && !n.read) ? s.unreadCount - 1 : s.unreadCount,
    }));
  },

  // SSE real-time stream
  connectSSE: () => {
    const token = getAccessToken();
    if (!token) return;
    const existing = get().sseConnection;
    if (existing) existing.close();

    const es = new EventSource(`/api/notifications/stream?token=${token}`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'notification' && msg.data) {
          set(s => ({
            notifications: [msg.data, ...s.notifications].slice(0, 50),
            unreadCount: s.unreadCount + 1,
          }));
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      // Only retry if token still valid and online
      const currentToken = getAccessToken();
      if (currentToken && navigator.onLine) {
        setTimeout(() => get().connectSSE(), 5000);
      }
    };
    set({ sseConnection: es });
  },

  disconnectSSE: () => {
    get().sseConnection?.close();
    set({ sseConnection: null });
  },
}));

export default useNotificationStore;
