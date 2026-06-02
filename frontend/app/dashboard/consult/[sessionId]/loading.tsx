import { PatientDetailSkeleton } from "@/components/skeletons/patient-detail";

/** Deeplink resolves to appointment detail — mirror that layout while redirecting. */
export default function ConsultDeepLinkLoading() {
  return <PatientDetailSkeleton />;
}
