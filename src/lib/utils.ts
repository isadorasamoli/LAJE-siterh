import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from './firebase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProjectNames(currentProjects?: string): string[] {
  return String(currentProjects || '')
    .split(',')
    .map(project => project.trim())
    .filter(project => project && project.toLowerCase() !== 'nenhum');
}

export function getProjectDeadlines(member: { currentProjects?: string; deadline?: string; projectDeadlines?: Record<string, string> }): Record<string, string> {
  const deadlines = member.projectDeadlines && typeof member.projectDeadlines === 'object'
    ? member.projectDeadlines
    : {};
  const projects = getProjectNames(member.currentProjects);

  if (Object.keys(deadlines).length > 0) return deadlines;
  if (projects.length === 1 && member.deadline) return { [projects[0]]: member.deadline };
  return {};
}

export function getProjectDetails(member: { projectDetails?: Record<string, string> }): Record<string, string> {
  return member.projectDetails && typeof member.projectDetails === 'object'
    ? member.projectDetails
    : {};
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
