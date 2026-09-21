import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";

/** Startseite: leitet je nach Anmeldestatus weiter. */
export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session ? "/dashboard" : "/anmelden");
}
