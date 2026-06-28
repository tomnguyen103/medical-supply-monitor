export interface TenantScopedRow {
  organizationId: string | null;
}

export function filterRowsForTenant<T extends TenantScopedRow>(
  rows: T[],
  organizationId: string,
): T[] {
  return rows.filter((row) => row.organizationId === organizationId);
}

export function assertTenantAccess(
  row: TenantScopedRow | null | undefined,
  organizationId: string,
  subject = "row",
): void {
  if (!row || row.organizationId !== organizationId) {
    throw new Error(`Tenant isolation violation for ${subject}.`);
  }
}
