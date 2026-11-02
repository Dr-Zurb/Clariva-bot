/** Hero shortcut → the matching How it works tab. */
export const HOW_STEP_EVENT = "halo-how-step";

export function openHowStep(index: number) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("how-it-works")?.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  window.dispatchEvent(new CustomEvent(HOW_STEP_EVENT, { detail: index }));
  if (window.location.hash !== "#how-it-works") {
    history.pushState(null, "", "#how-it-works");
  }
}
