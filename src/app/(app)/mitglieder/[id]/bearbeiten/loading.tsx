import { MemberFormSkeleton } from "@/modules/members/components/member-form-skeleton";

/** Ladezustand von „Mitglied bearbeiten“: die Karten des Formulars statt der Ansicht des Mitglieds. */
export default function EditMemberLoading() {
  return <MemberFormSkeleton label="Formular wird geladen …" />;
}
