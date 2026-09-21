import { z } from "zod";
import { personName } from "@/modules/auth/schemas";

export const profileNameSchema = z.object({
  firstName: personName("deinen Vornamen"),
  lastName: personName("deinen Nachnamen"),
});
export type ProfileNameInput = z.input<typeof profileNameSchema>;

export const emailNotificationsSchema = z.object({ enabled: z.boolean() });

export const revokeSessionSchema = z.object({ sessionId: z.string().min(10).max(200) });
