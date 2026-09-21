import { z } from "zod";

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Bitte gib eine E-Mail-Adresse ein.")
    .max(254, "Die E-Mail-Adresse ist zu lang.")
    .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein.")),
  roleId: z.string().min(1, "Bitte wähle eine Rolle.").max(64),
  memberId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : undefined)),
});
export type InviteInput = z.output<typeof inviteSchema>;
export type InviteFormInput = z.input<typeof inviteSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });
export const changeRoleSchema = z.object({
  membershipId: z.string().min(1).max(64),
  roleId: z.string().min(1).max(64),
});
export const membershipStatusSchema = z.object({
  membershipId: z.string().min(1).max(64),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});
