type TenantLike = {
  package_type?: string | null;
} | null | undefined;

const normalizeSegment = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

export const isCleaningControlPackage = (packageType?: string | null) => {
  const normalized = normalizeSegment(packageType);
  return ['cleaning_control', 'cleaning', 'limpeza', 'controle_limpeza'].includes(normalized);
};

export const isCleaningControlTenant = (tenant: TenantLike) => (
  isCleaningControlPackage(tenant?.package_type)
);

export const hasCleaningModulePackage = (tenant: TenantLike) => {
  const normalized = normalizeSegment(tenant?.package_type);
  return isCleaningControlPackage(normalized) || normalized === 'business_erp';
};

export const hasServiceBookingPackage = (tenant: TenantLike) => {
  const normalized = normalizeSegment(tenant?.package_type);
  return ['salon', 'aesthetic_clinic', 'business_erp'].includes(normalized);
};
