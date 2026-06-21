import { ReactNode } from "react";

export default function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-ink-400">
      {icon}
      <div className="text-base font-medium text-ink-500 dark:text-ink-300">{title}</div>
      {hint && <div className="max-w-md text-sm text-ink-400">{hint}</div>}
      {action}
    </div>
  );
}
