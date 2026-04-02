import type { ApplicationStatus } from "@/lib/types";

export type TemplateContext = {
  first_name: string;
  last_name: string;
  status: ApplicationStatus;
};

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (key === "first_name") return ctx.first_name;
    if (key === "last_name") return ctx.last_name;
    if (key === "status") return ctx.status;
    return "";
  });
}
