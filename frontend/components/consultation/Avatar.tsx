export type AvatarRole = "doctor" | "patient";

export interface AvatarProps {
  role: AvatarRole;
  size?: "xs" | "sm";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-4 w-4 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
};

const ROLE_STYLES: Record<
  AvatarRole,
  { initials: string; bg: string; text: string }
> = {
  doctor: { initials: "Dr", bg: "bg-blue-600", text: "text-white" },
  patient: { initials: "P", bg: "bg-gray-400", text: "text-white" },
};

/**
 * Tiny role initials circle for chat affordances (typing indicator, etc.).
 */
export function Avatar({
  role,
  size = "xs",
  className = "",
}: AvatarProps): JSX.Element {
  const style = ROLE_STYLES[role];
  return (
    <div
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold " +
        SIZE_CLASSES[size] +
        " " +
        style.bg +
        " " +
        style.text +
        (className ? " " + className : "")
      }
      aria-hidden
    >
      {style.initials}
    </div>
  );
}
