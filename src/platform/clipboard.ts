export const copyText = async (value: string) => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('A cópia para a área de transferência não está disponível neste dispositivo.');
  }

  await navigator.clipboard.writeText(value);
};
