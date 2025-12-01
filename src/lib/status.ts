export function cleanStatusDescription(description: string): string {
  const hospitalIndex = description.indexOf("hospital");
  if (hospitalIndex !== -1) {
    return description.slice(0, hospitalIndex + "hospital".length).trim();
  }

  return description;
}

// Helper function to get status background color class
export function getStatusBgColorClass(state: string): string {
  switch (state) {
    case "Okay":
      return "bg-emerald-400 dark:bg-emerald-600";
    case "Hospital":
      return "bg-rose-400 dark:bg-rose-600";
    case "Traveling":
      return "bg-sky-400 dark:bg-sky-600";
    case "Abroad":
      return "bg-amber-400 dark:bg-amber-600";
    default:
      return "bg-gray-400 dark:bg-gray-600";
  }
}
