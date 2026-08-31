export const detectBrowser = () => {
  if (!navigator) {
    return undefined;
  }

  if (navigator.userAgent.indexOf("Chrome") !== -1) {
    return "Chrome";
  }
  if (navigator.userAgent.indexOf("Firefox") !== -1) {
    return "Firefox";
  }
  if (navigator.userAgent.indexOf("Safari") !== -1) {
    return "Safari";
  }
};

export const isBrowser = typeof window !== "undefined";

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
