import { readFile, writeFile } from "node:fs/promises";
const [slug, title] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title) {
  console.error(
    'Использование: npm run blog:new -- nazvanie-stati "Название статьи"',
  );
  process.exitCode = 1;
} else {
  const categories = JSON.parse(
    await readFile("content/blog/categories.json", "utf8"),
  );
  const post = {
    slug,
    status: "draft",
    category: categories[0].slug,
    title,
    seoTitle: title,
    description: "",
    excerpt: "",
    image: {
      src: "/images/concept-living.webp",
      alt: "Светлые портьеры и тюль в гостиной",
      caption: "Идея оформления — визуализация.",
      width: 1672,
      height: 941,
    },
    intro: "",
    sections: [
      {
        id: "main-question",
        title: "Главный вопрос читателя",
        paragraphs: ["Напишите понятный ответ и практический пример."],
      },
    ],
    sources: [],
    related: [],
  };
  await writeFile(
    `content/blog/${slug}.json`,
    JSON.stringify(post, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    `Черновик создан: content/blog/${slug}.json. Инструкция: docs/BLOG.md`,
  );
}
