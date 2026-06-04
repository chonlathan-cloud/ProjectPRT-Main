import { ViewType } from '../../types';

export const REQUESTER_ALLOWED_VIEWS = new Set<ViewType>([
  ViewType.FORM,
  ViewType.DOCUMENT_MANAGER,
]);

const ELEVATED_ROLES = new Set([
  'admin',
  'approver',
  'accounting',
  'finance',
  'treasury',
  'executive',
  'viewer',
]);

export const normalizeRoles = (roles?: string[]) =>
  (Array.isArray(roles) ? roles : []).map((role) => role.toLowerCase());

export const isRequesterLimited = (roles?: string[]) => {
  const normalizedRoles = normalizeRoles(roles);
  return normalizedRoles.includes('requester') && !normalizedRoles.some((role) => ELEVATED_ROLES.has(role));
};

export const canAccessView = (roles: string[] | undefined, view: ViewType) => {
  if (!isRequesterLimited(roles)) {
    return true;
  }

  return REQUESTER_ALLOWED_VIEWS.has(view);
};

export const getDefaultViewForRoles = (roles?: string[]) =>
  isRequesterLimited(roles) ? ViewType.FORM : ViewType.DASHBOARD;

export const getStoredUserRoles = () => {
  const savedUser = localStorage.getItem('user');
  if (!savedUser) {
    return [];
  }

  try {
    const user = JSON.parse(savedUser) as { roles?: string[] };
    return normalizeRoles(user.roles);
  } catch (error) {
    console.error('Failed to parse user roles from local storage', error);
    return [];
  }
};
