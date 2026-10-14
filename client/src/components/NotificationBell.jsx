import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatBadge, timeAgo, getNotificationTarget } from "../utils/notificationView";

/**
 * 🔔 with unread count + dropdown of recent notifications.
 * Data comes from the server (GET /api/notifications) via React Query; the server decides
 * when reminders exist — nothing here is a reminder timer. The light polling below only
 * refreshes the list.
 */
export default function NotificationBell({ onNavigate }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationAPI.list({ limit: 20 }).then((res) => res.data),
    enabled: isAuthenticated,
    refetchInterval: 60 * 1000, // refresh the list once a minute (no WebSockets)
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: (id) => notificationAPI.markRead(id), onSuccess: refresh });
  const markAllRead = useMutation({ mutationFn: () => notificationAPI.markAllRead(), onSuccess: refresh });

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleClick = (n) => {
    if (!n.isRead) markRead.mutate(n._id);
    setOpen(false);
    const target = getNotificationTarget(n, user?.role);
    if (target) {
      navigate(target);
      onNavigate?.();
    }
  };

  if (!isAuthenticated) return null;
  const badge = formatBadge(unreadCount);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[85vw] bg-card border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors flex gap-3 ${
                    n.isRead ? "" : "bg-primary/5"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.isRead ? "bg-transparent" : "bg-primary"}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.isRead ? "font-medium" : "font-semibold"}`}>{n.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{n.message}</span>
                    <span className="block text-[11px] text-muted-foreground/80 mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
