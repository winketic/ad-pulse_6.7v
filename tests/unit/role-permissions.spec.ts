import { test, expect } from "playwright/test";
import {
  canAccessCompanyPage,
  canCreateTransaction,
  canManageMaterials,
  canManagePlans,
  canViewPlan,
} from "../../lib/auth/role-permissions";

test.describe("company role permissions", () => {
  test("warehouse is limited to inventory and movements", () => {
    expect(canAccessCompanyPage("warehouse", "/dashboard/warehouse")).toBe(true);
    expect(canAccessCompanyPage("warehouse", "/dashboard/transactions")).toBe(true);
    expect(canAccessCompanyPage("warehouse", "/dashboard/reports")).toBe(false);
    expect(canAccessCompanyPage("warehouse", "/dashboard/materials")).toBe(false);
    expect(canManageMaterials("warehouse")).toBe(false);
    expect(canManagePlans("warehouse")).toBe(false);
  });

  test("workshop can view only plans assigned to its own user", () => {
    expect(canAccessCompanyPage("workshop", "/dashboard/plans")).toBe(true);
    expect(canViewPlan("workshop", "workshop-1", "workshop-1")).toBe(true);
    expect(canViewPlan("workshop", "workshop-1", "workshop-2")).toBe(false);
    expect(canViewPlan("workshop", "workshop-1", null)).toBe(false);
  });

  test("workshop can only create expense transactions", () => {
    expect(canCreateTransaction("workshop", "expense")).toBe(true);
    for (const type of ["income", "return", "defect"] as const) {
      expect(canCreateTransaction("workshop", type)).toBe(false);
    }
  });

  test("admin and manager retain broader company permissions", () => {
    for (const role of ["admin", "manager"]) {
      expect(canManageMaterials(role)).toBe(true);
      expect(canManagePlans(role)).toBe(true);
      expect(canAccessCompanyPage(role, "/dashboard/reports")).toBe(true);
      expect(canViewPlan(role, "other-user", "assignee")).toBe(true);
    }
  });
});
