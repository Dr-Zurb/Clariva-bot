export const ARRIVAL_LINES = {
  video: "Sit in a quiet room. Keep your medicine strips in front of the camera.",
  voice: "Find a place where you can talk.",
  in_clinic: "Bring your old papers.",
} as const;

export type ArrivalModality = keyof typeof ARRIVAL_LINES;

export function arrivalLine(type: string | null | undefined): string | null {
  if (type === "video" || type === "voice" || type === "in_clinic") {
    return ARRIVAL_LINES[type];
  }
  return null;
}
