"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  MailPlusIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserCheckIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  changeRoleAction,
  inviteUserAction,
  removeUserAction,
  resendInvitationAction,
  revokeInvitationAction,
  setUserStatusAction,
} from "../actions";
import { inviteSchema } from "../schemas";

interface RoleOption {
  id: string;
  name: string;
  assignable: boolean;
}

export function InviteDialog({
  roles,
  members,
}: {
  roles: RoleOption[];
  members: { id: string; name: string; email: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const assignable = roles.filter((r) => r.assignable);
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: inviteSchema,
    defaultValues: {
      email: "",
      roleId: assignable.find((r) => r.name === "Mitglied")?.id ?? assignable[0]?.id ?? "",
      memberId: "",
    },
    action: inviteUserAction,
    successMessage: "Einladung versendet.",
    resetOnSuccess: true,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MailPlusIcon /> Person einladen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Person einladen</DialogTitle>
          <DialogDescription>
            Die Person erhält per E-Mail einen persönlichen Link (7 Tage gültig), um ihr Konto
            anzulegen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField
            form={form}
            name="email"
            label="E-Mail-Adresse"
            type="email"
            autoComplete="off"
            required
          />
          <SelectField
            form={form}
            name="roleId"
            label="Rolle"
            options={assignable.map((r) => ({ value: r.id, label: r.name }))}
            required
            hint="Du kannst nur Rollen vergeben, deren Rechte du selbst besitzt."
          />
          {members.length > 0 && (
            <SelectField
              form={form}
              name="memberId"
              label="Vorhandenes Mitglied verknüpfen (optional)"
              placeholder="Neues Mitglied anlegen"
              options={members.map((m) => ({
                value: m.id,
                label: m.name + (m.email ? ` (${m.email})` : ""),
              }))}
            />
          )}
          <SubmitButton pending={isPending} pendingLabel="Wird gesendet …">
            Einladung senden
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoleSelect({
  membershipId,
  roleId,
  roles,
  name,
  disabled,
}: {
  membershipId: string;
  roleId: string;
  roles: RoleOption[];
  name: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = roles.filter((r) => r.assignable || r.id === roleId);
  return (
    <NativeSelect
      aria-label={`Rolle von ${name}`}
      value={roleId}
      disabled={disabled || pending}
      className="h-8 w-auto min-w-40"
      onChange={(event) =>
        startTransition(async () => {
          const result = await changeRoleAction({ membershipId, roleId: event.target.value });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Rolle geändert.");
          router.refresh();
        })
      }
    >
      {options.map((r) => (
        <option key={r.id} value={r.id} disabled={!r.assignable && r.id !== roleId}>
          {r.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function UserActions({
  membershipId,
  name,
  status,
  isSelf,
}: {
  membershipId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (isSelf) return <span className="text-xs text-muted-foreground">Du</span>;

  const toggle = () =>
    startTransition(async () => {
      const result = await setUserStatusAction({
        membershipId,
        status: status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
      });
      if (!result.ok) toast.error(result.error.message);
      else toast.success(status === "ACTIVE" ? "Zugang gesperrt." : "Zugang freigegeben.");
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Aktionen für ${name}`} disabled={pending}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={toggle}>
          {status === "ACTIVE" ? <BanIcon /> : <UserCheckIcon />}{" "}
          {status === "ACTIVE" ? "Zugang sperren" : "Zugang freigeben"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmAction
          destructive
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}>
              <Trash2Icon /> Aus dem Verein entfernen
            </DropdownMenuItem>
          }
          title="Zugang entfernen?"
          description={`${name} kann sich nicht mehr in diesem Verein anmelden. Der Mitgliedsdatensatz bleibt erhalten, verliert aber die Verknüpfung zum Benutzerkonto.`}
          confirmLabel="Entfernen"
          action={() => removeUserAction({ id: membershipId })}
          successMessage="Zugang entfernt."
          onSuccess={() => router.refresh()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvitationActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message ?? "Fehler");
      else toast.success(success);
      router.refresh();
    });

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => resendInvitationAction({ id }), "Einladung erneut gesendet.")}
      >
        <RefreshCwIcon /> Erneut senden
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Einladung für ${email} zurückziehen`}
        onClick={() => run(() => revokeInvitationAction({ id }), "Einladung zurückgezogen.")}
      >
        <XIcon /> Zurückziehen
      </Button>
    </div>
  );
}
