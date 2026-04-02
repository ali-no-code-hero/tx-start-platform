export type UserRole = "admin" | "staff" | "customer";

export type ApplicationStatus =
  | "Pending"
  | "Confirmed"
  | "Rejected"
  | "Declined"
  | "Loaned";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "Pending",
  "Confirmed",
  "Rejected",
  "Declined",
  "Loaned",
];
