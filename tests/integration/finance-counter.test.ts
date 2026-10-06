import { describe, expect, it } from "vitest";
import { nextNumbers } from "@/modules/finance/ledger";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

describe("Nummernkreise", () => {
  it("gleichzeitige erste Nummern eines neuen Jahres: lückenlos, ohne Fehler", async () => {
    const club = await createClub("Zählerverein");
    const board = await addUserToClub(club, "BOARD");
    const ctx = await contextFor(board.user.id, club.id);
    for (const year of [2031, 2032, 2033]) {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          ctx.db.$transaction((tx) => nextNumbers(tx, ctx.clubId, "LEDGER", year, 2)),
        ),
      );
      expect(results.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
});
