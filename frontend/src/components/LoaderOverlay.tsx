type LoaderOverlayProps = {
  title?: string;
  description?: string;
};

export default function LoaderOverlay({
  title = "Processing Certificate",
  description = "Please keep this page open until the transaction finishes.",
}: LoaderOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <div className="surface-card flex w-full max-w-sm flex-col items-center rounded-lg p-8 text-center">
        <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-accent animate-spin" />
          <div className="brand-gradient flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold text-white shadow-[var(--glow-primary)]">
            Wait
          </div>
        </div>
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
