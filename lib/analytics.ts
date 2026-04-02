export type AnalyticsPayload = {
  monthly_volume: { month: string; count: number }[];
  avg_loan_requested: number | null;
  avg_loan_approved: number | null;
  reapplication_rate: number | null;
  total_applications_in_range: number;
};
