/**
 * Side-effect bootstrap: apply the active clinical region pack once at module load.
 * Imported from `app/layout.tsx` so cockpit hints use region values on first render.
 */
import { resolveClinicalRegion } from "@/lib/config/clinical-region";
import { CLINICAL_REGION_APPLIERS } from "@/lib/config/regions";

const region = resolveClinicalRegion();
CLINICAL_REGION_APPLIERS[region]();
