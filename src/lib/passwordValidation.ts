import { z } from 'zod';

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password strength according to security requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Uma letra maiúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Uma letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Um número');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Um caractere especial');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Zod schema for strong password validation
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .refine((val) => /[A-Z]/.test(val), 'Senha deve conter uma letra maiúscula')
  .refine((val) => /[a-z]/.test(val), 'Senha deve conter uma letra minúscula')
  .refine((val) => /[0-9]/.test(val), 'Senha deve conter um número')
  .refine((val) => /[^A-Za-z0-9]/.test(val), 'Senha deve conter um caractere especial');

/**
 * Format password requirements as user-friendly message
 */
export function getPasswordRequirementsMessage(): string {
  return 'Mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial';
}
