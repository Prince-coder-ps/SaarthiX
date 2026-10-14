import { CalendarDays, Video } from "lucide-react";
import { getSessionCardState, formatSessionWhen } from "../utils/sessionView";

/**
 * Scheduled-session summary + "Join Meet" button for a request card.
 * Used by BOTH the student and alumni cards; reads request.session from the API,
 * so both participants see exactly the same date/time and link.
 */
export default function SessionInfo({ request }) {
  const { showInfo, showMeet } = getSessionCardState(request);
  if (!showInfo) return null;

  const { session } = request;

  return (
    <div className="inline-flex items-center gap-3 flex-wrap rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-purple-600 shrink-0" />
        <div className="leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Scheduled</p>
          <p className="text-xs font-medium">{formatSessionWhen(session)}</p>
        </div>
      </div>

      {showMeet && (
        <a
          href={session.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
        >
          <Video className="h-3.5 w-3.5" /> Join Meet
        </a>
      )}
    </div>
  );
}
