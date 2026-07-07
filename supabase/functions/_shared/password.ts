export function getPasswordErrors(password: string) {
  const errors: string[] = [];

  if (password.length < 8) errors.push("Mínimo 8 caracteres");
  if (!/[A-Z]/.test(password)) errors.push("Uma letra maiúscula");
  if (!/[a-z]/.test(password)) errors.push("Uma letra minúscula");
  if (!/[0-9]/.test(password)) errors.push("Um número");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Um caractere especial");

  return errors;
}
