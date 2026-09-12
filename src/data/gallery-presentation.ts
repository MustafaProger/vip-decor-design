// Display windows exclude decorative borders baked into the source photographs.
// Original files and the migration archive are kept unchanged.
export const photoCrops: Record<
  string,
  { size: [number, number]; view: [number, number, number, number] }
> = {
  "2205d403206a0fb03f.webp": {
    size: [1238, 1600],
    view: [110, 112, 1026, 1370],
  },
  "74a4c8d1c28498b376.webp": { size: [815, 1043], view: [85, 94, 654, 835] },
  "197eaa24389840dbbe.webp": { size: [690, 1082], view: [122, 110, 438, 849] },
  "911b2bf5a40059d89b.webp": { size: [767, 1036], view: [95, 215, 590, 703] },
  "bdf7eaa4894d2a9641.webp": { size: [874, 1280], view: [120, 140, 626, 961] },
  "d59c9f9c329dae0408.webp": { size: [870, 1117], view: [77, 83, 709, 956] },
  "02098397944a96e1d9.webp": { size: [670, 1092], view: [104, 112, 451, 874] },
  "692bde99c20861d758.webp": { size: [773, 1043], view: [70, 69, 632, 896] },
  "5dd8f14eaef9515e0b.webp": { size: [835, 1024], view: [3, 40, 829, 981] },
  "df413fa7967205199b.webp": { size: [1024, 858], view: [0, 45, 1024, 772] },
  "dcd9e2794306db7846.webp": { size: [1024, 858], view: [0, 45, 1024, 772] },
  "6dcb686e0bf0d0103d.webp": { size: [730, 1024], view: [0, 36, 730, 974] },
};

const projectCaptions: Record<string, string> = {
  "2205d403206a0fb03f.webp": "Текстиль в оттенках сливы",
  "74a4c8d1c28498b376.webp": "Портьеры и воздушный тюль",
  "197eaa24389840dbbe.webp": "Классика в узоре",
  "911b2bf5a40059d89b.webp": "Мягкая драпировка",
  "bdf7eaa4894d2a9641.webp": "Бирюзовый акцент",
  "d59c9f9c329dae0408.webp": "Уютная гостиная",
  "02098397944a96e1d9.webp": "Игра света и фактур",
  "692bde99c20861d758.webp": "Орнамент и золотые оттенки",
  "4fb6a1c023a26f3d19.webp": "Глубокий зелёный",
  "5dd8f14eaef9515e0b.webp": "Свет сквозь тюль",
  "21aef34c55a0761cef.webp": "Воздушные складки",
  "df413fa7967205199b.webp": "Парадная гостиная",
  "dcd9e2794306db7846.webp": "Гостиная в тёплых тонах",
  "6dcb686e0bf0d0103d.webp": "Спокойная палитра",
  "5ba589d49ddff85757.webp": "Текстиль для спальни",
  "053a1d496a618e96a0.webp": "Выразительный подхват",
  "4426e78d83c22d36d3.webp": "Классическое оформление окна",
  "eabf07a8402b07c04c.webp": "Плавные линии",
  "4e6b1b809f6cf5e694.webp": "Высокие окна",
  "502ea1bbc3424e6ae7.webp": "Портьера с подхватом",
  "83508fcb93e903cb1f.webp": "Синие акценты в столовой",
  "20365d03f07e183569.webp": "Цветочный рисунок",
  "ff1a974cf5d2e379f3.webp": "Светлое пространство",
  "096077309e92614a5e.webp": "Нежные оттенки",
  "07c90b1c23208dc383.webp": "Фактура крупным планом",
  "df4d7d4fc7656d723a.webp": "Зелёный и цветочный принт",
  "b9109ed7573af2773f.webp": "Спальня в мягких тонах",
  "2a566340ab08ded62e.webp": "Лаконичное оформление",
};

export const projectCaption = (src: string) =>
  projectCaptions[src.split("/").pop() || ""] ||
  "Текстильное оформление VIP Decor Design";
