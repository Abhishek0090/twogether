// Chat backgrounds. Each pattern is a tiled SVG drawn over a gradient.

const hearts = (color: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='${color}' opacity='0.45'><path d='M20 26c-3-6-12-5-12 2 0 5 6 9 12 14 6-5 12-9 12-14 0-7-9-8-12-2z'/><path d='M84 80c-2-4-8-3.5-8 1.5 0 3.5 4 6 8 9.5 4-3.5 8-6 8-9.5 0-5-6-5.5-8-1.5z'/><circle cx='92' cy='22' r='2.5'/><circle cx='30' cy='92' r='2'/><path d='M60 54l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z'/></g></svg>`,
  )}")`;

export interface Wallpaper {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "blush",
    name: "Blush",
    light: `${hearts("#f9a8d4")} , linear-gradient(160deg, #fff1f5 0%, #ffe4ec 100%)`,
    dark: `${hearts("#831843")} , linear-gradient(160deg, #1c1017 0%, #200d18 100%)`,
  },
  {
    id: "lavender",
    name: "Lavender",
    light: `${hearts("#c4b5fd")} , linear-gradient(160deg, #f5f3ff 0%, #ede9fe 100%)`,
    dark: `${hearts("#4c1d95")} , linear-gradient(160deg, #13101f 0%, #1a1230 100%)`,
  },
  {
    id: "peach",
    name: "Peach",
    light: `${hearts("#fdba74")} , linear-gradient(160deg, #fff7ed 0%, #ffedd5 100%)`,
    dark: `${hearts("#7c2d12")} , linear-gradient(160deg, #1a120c 0%, #24140b 100%)`,
  },
  {
    id: "mint",
    name: "Mint",
    light: `${hearts("#86efac")} , linear-gradient(160deg, #f0fdf4 0%, #dcfce7 100%)`,
    dark: `${hearts("#145231")} , linear-gradient(160deg, #0b1510 0%, #0d1d14 100%)`,
  },
  {
    id: "sky",
    name: "Sky",
    light: `${hearts("#7dd3fc")} , linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 100%)`,
    dark: `${hearts("#0c4a6e")} , linear-gradient(160deg, #0a121a 0%, #0b1824 100%)`,
  },
  {
    id: "plain",
    name: "Plain",
    light: "linear-gradient(#f4f4f5, #f4f4f5)",
    dark: "linear-gradient(#0f0f12, #0f0f12)",
  },
];

export function wallpaperById(id: string | undefined) {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}
