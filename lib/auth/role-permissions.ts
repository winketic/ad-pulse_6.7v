export type CompanyRole = "admin" | "manager" | "warehouse" | "workshop";
export type TransactionKind = "income" | "expense" | "return" | "defect";

const PAGE_ROLES: Record<string, readonly CompanyRole[]> = {
  "/dashboard/materials": ["admin", "manager"],
  "/dashboard/warehouse": ["admin", "manager", "warehouse"],
  "/dashboard/transactions": ["admin", "manager", "warehouse", "workshop"],
  "/dashboard/plans": ["admin", "manager", "workshop"],
  "/dashboard/reports": ["admin", "manager"],
  "/dashboard/produce": ["admin", "manager"],
  "/dashboard/whatsapp": ["admin", "manager"],
  "/dashboard/settings": ["admin", "manager", "warehouse", "workshop"],
};

export function canAccessCompanyPage(role: string, pathname: string): boolean {
  const route = Object.keys(PAGE_ROLES).find(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
  if (!route) return true;
  return PAGE_ROLES[route].includes(role as CompanyRole);
}

export function canCreateTransaction(role: string, type: TransactionKind): boolean {
  if (role === "admin" || role === "manager") return true;
  if (role === "warehouse") return true;
  return role === "workshop" && type === "expense";
}

export function canManageMaterials(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function canManagePlans(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function canViewPlan(
  role: string,
  userId: string,
  assignedTo: string | null,
): boolean {
  return role === "admin" || role === "manager" ||
    (role === "workshop" && assignedTo === userId);
}

export function defaultDashboardPath(role: string): string {
  if (role === "warehouse") return "/dashboard/warehouse";
  if (role === "workshop") return "/dashboard/plans";
  return "/dashboard";
}
