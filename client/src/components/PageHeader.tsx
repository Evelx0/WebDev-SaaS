export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-8 py-6 border-b border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
      </div>
    </div>
  );
}
