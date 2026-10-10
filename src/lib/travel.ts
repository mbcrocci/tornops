import type { StatusClass } from "./faction";

// One-way minutes: https://wiki.torn.com/wiki/Travel#Destinations
// Columns: Standard, Airstrip, Private, Business.
export const travelTimes = {
  Mexico: [26, 18, 13, 8],
  "Cayman Islands": [35, 25, 18, 11],
  Canada: [41, 29, 21, 12],
  Hawaii: [106, 74, 53, 32],
  "United Kingdom": [159, 111, 80, 48],
  Argentina: [117, 82, 59, 35],
  Switzerland: [123, 86, 62, 37],
  Japan: [225, 158, 113, 68],
  China: [175, 123, 88, 53],
  "United Arab Emirates": [184, 129, 92, 55],
  "South Africa": [297, 208, 149, 89],
} as const;

type Destination = keyof typeof travelTimes;
export type TravelEstimate = {
  destination: Destination;
  returning: boolean;
  departedAt: number;
  earliestArrival: number;
  latestArrival: number;
  arrivalAt: number;
  method: string;
  assumedMethod: boolean;
};
export type TravelObservation = {
  status: StatusClass;
  observedAt: number;
  estimate?: TravelEstimate;
};

function destinationIn(status: StatusClass): Destination | undefined {
  const text = `${status.description} ${status.details}`.toLowerCase();
  return (Object.keys(travelTimes) as Destination[]).find((name) =>
    text.includes(name.toLowerCase()),
  );
}

export function observeTravel(
  previous: TravelObservation | undefined,
  status: StatusClass,
  observedAt: number,
): TravelObservation {
  if (previous && observedAt <= previous.observedAt) return previous;
  const observation: TravelObservation = { status, observedAt };
  if (status.state !== "Traveling") return observation;

  const returning = /returning|traveling to torn/i.test(status.description);
  const destination =
    destinationIn(status) ??
    (returning && previous
      ? (destinationIn(previous.status) ?? previous.estimate?.destination)
      : undefined);
  if (!destination) return observation;

  const methods = ["Standard", "Airstrip", "Private", "Business"];
  const methodIndex = methods.findIndex(
    (method) => method.toLowerCase() === status.travel_type?.toLowerCase(),
  );
  const method = methods[methodIndex < 0 ? 1 : methodIndex];
  const duration = travelTimes[destination][methodIndex < 0 ? 1 : methodIndex] * 60_000;

  if (previous?.status.state === "Traveling") {
    const estimate = previous.estimate;
    if (estimate?.destination === destination && estimate.returning === returning) {
      observation.estimate = {
        ...estimate,
        method,
        assumedMethod: methodIndex < 0,
        arrivalAt: estimate.departedAt + duration,
        earliestArrival:
          estimate.departedAt - (estimate.latestArrival - estimate.earliestArrival) / 2 + duration,
        latestArrival:
          estimate.departedAt + (estimate.latestArrival - estimate.earliestArrival) / 2 + duration,
      };
    }
    return observation;
  }

  // A departure can only be bounded if we observed the preceding status.
  if (!previous || !["Okay", "Hospital", "Abroad"].includes(previous.status.state)) {
    return observation;
  }
  const departedAt = (previous.observedAt + observedAt) / 2;
  observation.estimate = {
    destination,
    returning,
    departedAt,
    earliestArrival: previous.observedAt + duration,
    latestArrival: observedAt + duration,
    arrivalAt: departedAt + duration,
    method,
    assumedMethod: methodIndex < 0,
  };
  return observation;
}
