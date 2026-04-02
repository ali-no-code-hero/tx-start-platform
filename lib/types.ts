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

export type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  urgent_same_day: boolean;
  loan_amount_requested: number | null;
  loan_amount_approved: number | null;
  type_of_loan: string | null;
  location_id: string | null;
  submission_metadata: Record<string, unknown> | null;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  locations: { name: string } | null;
};
