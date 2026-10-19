export type AdminDeparture = {
  id: string;
  startsAt: string;
  endsAt: string;
  basePriceVnd: string | null;
  salePriceVnd: string;
  minPeople: number | null;
  maxPeople: number | null;
  bookedPeople: number | null;
  status: "open" | "closed" | "full";
  priceConfirmed: boolean;
};
export type DepartureList = {
  id: string;
  name: string;
  revision: number;
  departures: AdminDeparture[];
};
export function vnDateInput(value: string) {
  return new Date(Date.parse(value) + 7 * 3600_000).toISOString().slice(0, 16);
}
export function vnDateIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}
