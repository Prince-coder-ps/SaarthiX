const steps = [
  { key: "pending",   label: "Request Sent" },
  { key: "accepted",  label: "Accepted"     },
  { key: "scheduled", label: "Scheduled"    },
  { key: "completed", label: "Completed"    },
];

export default function MentorshipStepper({ currentStep }) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          <div className="flex flex-col items-center min-w-[80px]">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                i <= currentIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-xs mt-1 text-center font-medium text-muted-foreground">
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 w-8 mx-1 transition-colors ${
                i < currentIdx ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
