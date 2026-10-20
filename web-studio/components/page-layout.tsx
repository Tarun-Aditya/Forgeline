import { cn } from "@/lib/utils";

type Props = {
  title: string;
  breadcrumbs?: string[];
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  variant?: "container" | "fit" | "narrow";
  children: React.ReactNode;
};

/** Every page gets the same header and spacing, as in Mastra Studio's PageLayout. */
export function PageLayout({ title, breadcrumbs = [], actions, toolbar, variant = "container", children }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-header-default shrink-0 items-center gap-3 border-b border-surface-rim px-4">
        <nav className="flex items-center gap-1.5 text-label text-muted-foreground" aria-label="Breadcrumb">
          {breadcrumbs.map((b) => (
            <span key={b} className="flex items-center gap-1.5">{b}<span aria-hidden className="text-placeholder">/</span></span>
          ))}
          <h1 className="text-label text-foreground">{title}</h1>
        </nav>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      {toolbar}
      <div className={cn("min-h-0 flex-1 p-4", variant === "fit" ? "overflow-hidden" : "overflow-auto", variant === "narrow" && "mx-auto w-full max-w-3xl")}>
        {children}
      </div>
    </div>
  );
}
