import { redirect } from "next/navigation";

/** Default admin landing → verifications inbox. */
export default function AdminIndexPage() {
  redirect("/admin/verifications");
}
