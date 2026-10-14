import { MemberFormSkeleton } from "@/modules/members/components/member-form-skeleton";

/** Ladezustand von „Neues Mitglied“: die Karten des Formulars statt der Mitgliederliste. */
export default function NewMemberLoading() {
  return <MemberFormSkeleton label="Formular wird geladen …" />;
}
