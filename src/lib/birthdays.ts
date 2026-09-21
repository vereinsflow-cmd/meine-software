/**
 * Nächster Geburtstag ab einem Stichtag – reine Kalenderrechnung mit `@db.Date`-Werten (UTC-Mitternacht).
 *
 * Wer am 29. Februar geboren ist, feiert in Jahren ohne Schalttag am 1. März – so, wie es auch die Altersberechnung
 * (`ageOn`) zählt: An diesem Tag wird die Person ein Jahr älter.
 */
export interface NextBirthday {
  /** Kalendertag (UTC-Mitternacht) des nächsten Geburtstags; heute zählt mit. */
  date: Date;
  /** Das Alter, das die Person an diesem Tag erreicht. */
  turns: number;
  /** Tage ab dem Stichtag (0 = heute). */
  inDays: number;
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function birthdayIn(year: number, birthDate: Date): Date {
  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();
  if (month === 1 && day === 29 && !isLeapYear(year)) return new Date(Date.UTC(year, 2, 1));
  return new Date(Date.UTC(year, month, day));
}

export function nextBirthday(birthDate: Date, today: Date): NextBirthday {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let year = today.getUTCFullYear();
  let date = birthdayIn(year, birthDate);
  if (date.getTime() < todayUtc) {
    year += 1;
    date = birthdayIn(year, birthDate);
  }
  return {
    date,
    turns: year - birthDate.getUTCFullYear(),
    inDays: Math.round((date.getTime() - todayUtc) / 86_400_000),
  };
}
