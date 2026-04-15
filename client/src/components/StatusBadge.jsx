const palette = {
  pending:   "bg-yellow-100  text-yellow-800  border-yellow-300",
  accepted:  "bg-blue-100    text-blue-800    border-blue-300",
  rejected:  "bg-red-100     text-red-800     border-red-300",
  scheduled: "bg-purple-100  text-purple-800  border-purple-300",
  completed: "bg-green-100   text-green-800   border-green-300",
  cancelled: "bg-gray-100    text-gray-600    border-gray-300",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
        palette[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status}
    </span>
  );
}
