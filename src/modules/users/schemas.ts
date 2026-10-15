import { z } from "zod";
import { idString, optionalIdString } from "@/lib/id-schema";

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Bitte gib eine E-Mail-Adresse ein.")
    .max(254, "Die E-Mail-Adresse ist zu lang.")
    .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein.")),
  roleId: z.string().min(1, "Bitte wähle eine Rolle.").max(64),
  memberId: optionalIdString,
});
export type InviteInput = z.output<typeof inviteSchema>;
export type InviteFormInput = z.input<typeof inviteSchema>;

export { idSchema } from "@/lib/id-schema";
export const changeRoleSchema = z.object({
  membershipId: idString,
  roleId: idString,
});
export const membershipStatusSchema = z.object({
  membershipId: idString,
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});
