export const getCurrentYear = () => new Date().getFullYear();

export const getLocalDateInputValue = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const getArabicCurrentDate = () => new Date().toLocaleDateString('ar-EG');

export const getCurrentIsoTimestamp = () => new Date().toISOString();
