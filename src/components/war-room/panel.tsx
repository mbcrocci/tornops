import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "@container flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4",
        className,
      )}
      {...props}
    />
  );
}
