export const clamp = (v, min, max) => isNaN(v) ? min : Math.max(min, Math.min(max, v));
export const safeMod = (n, m) => ((n % m) + m) % m;
export const generateId = () => Math.random().toString(36).substr(2, 9);
