import type { Service, ServiceProfessional } from '@/context/DataContext';

const buildServiceBindingSet = (links: ServiceProfessional[]) => new Set(links.map((link) => link.service_id));

export const isServiceAvailableForProfessional = (
  links: ServiceProfessional[],
  professionalId: string | null | undefined,
  serviceId: string | null | undefined,
) => {
  if (!serviceId) return false;

  const boundServices = buildServiceBindingSet(links);
  if (!boundServices.has(serviceId)) {
    return true;
  }

  if (!professionalId) {
    return false;
  }

  return links.some((link) => link.service_id === serviceId && link.professional_id === professionalId);
};

export const getAvailableServicesForProfessional = (
  services: Service[],
  links: ServiceProfessional[],
  professionalId: string | null | undefined,
  currentServiceId?: string | null,
) => (
  services.filter((service) => (
    isServiceAvailableForProfessional(links, professionalId, service.id)
    || (currentServiceId ? service.id === currentServiceId : false)
  ))
);

export const getServiceDurationForProfessional = (
  services: Service[],
  links: ServiceProfessional[],
  professionalId: string | null | undefined,
  serviceId: string | null | undefined,
) => {
  if (!serviceId) return null;

  const specificLink = professionalId
    ? links.find((link) => link.service_id === serviceId && link.professional_id === professionalId)
    : null;

  if (specificLink?.duration_minutes) {
    return specificLink.duration_minutes;
  }

  return services.find((service) => service.id === serviceId)?.duration_minutes ?? null;
};
