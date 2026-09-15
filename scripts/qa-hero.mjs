import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = "docs/qa-reviews-daily";
await mkdir(output, { recursive: true });
const seed = JSON.parse(await readFile("src/data/yandex-reviews.json", "utf8"));
const response = await fetch("http://127.0.0.1:5180/api/reviews");
expect(response.status).toBe(200);
const data = await response.json();
const sortedReviews = [
  ...data.reviews.filter((review) => review.photos.length),
  ...data.reviews.filter((review) => !review.photos.length),
];
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const checks = [];
const layouts = [];
const videoRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (/\.(mp4|webm)(\?|$)/.test(request.url()))
    videoRequests.push(request.url());
});

async function settle(target = page) {
  await target.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) image.loading = "eager";
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
  });
}

try {
  for (const route of ["/", "/projects"]) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 1000 });
      await page.goto(`http://127.0.0.1:5180${route}`);
      await expect(page.locator(".review-card")).toHaveCount(
        route === "/" ? 3 : 9,
      );
      await settle();
      const initialAuthors = await page
        .locator(".review-author :is(h2, h3)")
        .allTextContents();
      expect(initialAuthors).toEqual(
        sortedReviews
          .slice(0, route === "/" ? 3 : 9)
          .map((review) => review.author),
      );
      if (route === "/") {
        await expect(
          page.locator(".reviews-sentinel, .reviews-load-more"),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Все отзывы", exact: true }),
        ).toHaveAttribute("href", "/projects");
      } else {
        await expect(
          page.getByRole("heading", {
            name: "Отзывы клиентов",
            level: 1,
            exact: true,
          }),
        ).toHaveCount(1);
        await expect(
          page.getByText("Самое ценное — ваше доверие", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Личный опыт. Настоящие впечатления.", {
            exact: true,
          }),
        ).toHaveCount(0);
      }
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        broken: [...document.images]
          .filter((image) => !image.complete || !image.naturalWidth)
          .map((image) => image.src),
        h1s: document.querySelectorAll("h1").length,
        columns: getComputedStyle(
          document.querySelector(".reviews-grid"),
        ).gridTemplateColumns.split(" ").length,
      }));
      expect(layout.overflow, `${route} overflow at ${width}`).toBe(false);
      expect(layout.broken, `${route} broken images at ${width}`).toEqual([]);
      expect(layout.h1s).toBe(1);
      expect(layout.columns).toBe(width >= 1024 ? 3 : width >= 768 ? 2 : 1);
      await expect(
        page.locator(
          ".reviews-rail, .review-portrait, .review-avatar, .review-initials, .gallery-grid, .home-projects, .home-curtain-types, .home-order-photo, video",
        ),
      ).toHaveCount(0);
      if (route === "/") {
        expect(
          await page
            .locator(
              ".home-opening, #order, .home-materials, #reviews, .home-help",
            )
            .evaluateAll((nodes) => nodes.map((node) => node.className)),
        ).toEqual([
          "home-opening",
          "home-section home-order",
          "home-section home-materials",
          "home-section home-reviews",
          "home-help",
        ]);
        await expect(page.locator(".home-hero-photo img")).toBeVisible();
        await expect(page.locator("#order img, #order image")).toHaveCount(0);
      }
      if ([390, 1440].includes(width)) {
        await page.screenshot({
          path: `${output}/${route === "/" ? "home" : "reviews"}-${width}.png`,
          fullPage: true,
        });
        const axe = await new AxeBuilder({ page }).include("main").analyze();
        expect(
          axe.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          `axe ${route} ${width}`,
        ).toEqual([]);
      }
      layouts.push({ route, width, ...layout });
    }
  }
  checks.push(
    "12 route/viewport checks: Home3, reviews9 initially, photos-first order, single concise heading, responsive3/2/1 columns;4 Axe scans.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5180/projects");
  await expect(page.locator(".review-card")).toHaveCount(9);
  const batches = [9];
  while (batches.at(-1) < data.reviews.length) {
    const expected = Math.min(data.reviews.length, batches.at(-1) + 9);
    await page.locator(".reviews-sentinel").scrollIntoViewIfNeeded();
    await expect(page.locator(".review-card")).toHaveCount(expected);
    batches.push(expected);
  }
  await expect(page.locator(".reviews-load-more")).toHaveCount(0);
  const renderedAuthors = await page
    .locator(".review-author :is(h2, h3)")
    .allTextContents();
  expect(renderedAuthors).toEqual(sortedReviews.map((review) => review.author));
  await settle();
  const renderedPhotos = await page
    .locator(".review-card img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  const attachedPhotos = data.reviews.flatMap((review) =>
    (review.photos || []).map((photo) => photo.src),
  );
  for (const src of renderedPhotos) expect(attachedPhotos).toContain(src);
  checks.push(
    `Scroll appends nine at a time in stable photos-first order: ${batches.join("→")}; every displayed photo belongs to a review attachment.`,
  );

  const firstCard = page.locator(".review-card").first();
  const readButton = firstCard.getByRole("button", { name: /Читать отзыв:/ });
  await readButton.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("blockquote")).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveAttribute(
    "href",
    await firstCard.locator(".review-source").getAttribute("href"),
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  const dialogAxe = await new AxeBuilder({ page })
    .include("dialog[open]")
    .analyze();
  expect(dialogAxe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: `${output}/review-sheet-1440.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(readButton).toBeFocused();
  checks.push(
    "Review sheet has matching original source, passes Axe, traps keyboard focus and restores focus on Escape.",
  );

  const multiPhotoIndex = sortedReviews.findIndex(
    (review) => review.photos?.length > 2,
  );
  expect(multiPhotoIndex).toBeGreaterThanOrEqual(0);
  const photoReview = sortedReviews[multiPhotoIndex];
  const photoCard = page.locator(".review-card").nth(multiPhotoIndex);
  await expect(photoCard.locator(".review-work-photo")).toHaveCount(2);
  const photoButton = photoCard.locator(".review-work-photo").first();
  await photoButton.click();
  await expect(dialog.locator("img")).toHaveAttribute(
    "src",
    photoReview.photos[0].src,
  );
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("img")).toHaveAttribute(
    "src",
    photoReview.photos[1].src,
  );
  for (let index = 2; index < photoReview.photos.length; index++) {
    await dialog
      .getByRole("button", { name: "Следующее фото", exact: true })
      .click();
    await expect(dialog.locator("img")).toHaveAttribute(
      "src",
      photoReview.photos[index].src,
    );
  }
  await expect(
    dialog.getByRole("button", { name: "Следующее фото", exact: true }),
  ).toBeDisabled();
  const photoAxe = await new AxeBuilder({ page })
    .include("dialog[open]")
    .analyze();
  expect(photoAxe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: `${output}/photo-sheet-1440.png` });
  await page.keyboard.press("Escape");
  await expect(photoButton).toBeFocused();
  checks.push(
    "Cards show at most two previews; gallery opens every photo of its review, supports arrows, stops at end, passes Axe and restores focus.",
  );

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto("http://127.0.0.1:5180/projects");
  await expect(mobile.locator(".review-card")).toHaveCount(9);
  await mobile.locator(".review-work-photo").first().click();
  await expect(mobile.locator("dialog[open] img")).toBeVisible();
  expect(
    await mobile
      .locator("dialog[open]")
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await mobile.screenshot({ path: `${output}/photo-sheet-390.png` });
  await mobile.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(mobile.locator(".review-card")).toHaveCount(9);
  await mobile.locator(".review-read").first().click();
  await expect(mobile.locator("dialog[open] blockquote")).toBeVisible();
  await mobile.screenshot({ path: `${output}/review-sheet-390.png` });
  await mobileContext.close();
  checks.push(
    "Mobile photo and review sheets fit390px; opening/closing sheets does not append extra reviews.",
  );

  await page.route(/\/(images\/reviews|api\/review-media)\//, (route) =>
    route.abort(),
  );
  await page.goto("http://127.0.0.1:5180/projects");
  await expect(page.locator(".review-card")).toHaveCount(9);
  await settle();
  await expect(page.locator(".review-card img")).toHaveCount(0);
  await expect(page.locator(".review-card-without-photo")).toHaveCount(9);
  checks.push(
    "Unavailable attachment images collapse cleanly to text-only cards without substitute images.",
  );
  const fallbackContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await fallbackContext.addInitScript(() => {
    window.IntersectionObserver = undefined;
  });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto("http://127.0.0.1:5180/projects");
  await expect(fallbackPage.locator(".review-card")).toHaveCount(9);
  await fallbackPage.locator(".reviews-load-more").click();
  await expect(fallbackPage.locator(".review-card")).toHaveCount(18);
  await fallbackContext.close();
  checks.push(
    "Manual load-more button adds next9 when IntersectionObserver is unavailable.",
  );

  const apiContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const apiPage = await apiContext.newPage();
  const freshData = structuredClone(data);
  freshData.rating = 4.7;
  const firstPhotoReview = freshData.reviews.find(
    (review) => review.photos.length,
  );
  const newMediaPath = "/api/review-media/" + "c".repeat(64) + ".webp";
  const oldPhoto = firstPhotoReview.photos[0];
  const photoBytes = oldPhoto.src.startsWith("/images/")
    ? await readFile("public" + oldPhoto.src)
    : Buffer.from(
        await (
          await fetch("http://127.0.0.1:5180" + oldPhoto.src)
        ).arrayBuffer(),
      );
  firstPhotoReview.photos[0].src = newMediaPath;
  await apiPage.route("**" + newMediaPath, (route) =>
    route.fulfill({ body: photoBytes, contentType: "image/webp" }),
  );
  await apiPage.route("**/api/reviews", (route) =>
    route.fulfill({ json: freshData }),
  );
  await apiPage.goto("http://127.0.0.1:5180/");
  await expect(apiPage.locator(".reviews-stats dd").first()).toContainText(
    "4,7",
  );
  await expect(apiPage.locator(".review-card img").first()).toHaveAttribute(
    "src",
    newMediaPath,
  );
  await expect(apiPage.locator(".review-card")).toHaveCount(3);
  await apiPage.unroute("**/api/reviews");
  await apiPage.route("**/api/reviews", (route) =>
    route.fulfill({
      json: { ...freshData, reviews: freshData.reviews.slice(0, 2) },
    }),
  );
  await apiPage.getByRole("link", { name: "Все отзывы", exact: true }).click();
  await expect(apiPage).toHaveURL(/\/projects$/);
  await expect(apiPage.locator(".review-card")).toHaveCount(9);
  await expect(apiPage.locator(".reviews-stats dd").first()).toContainText(
    "4,7",
  );
  await apiPage.reload();
  await expect(apiPage.locator(".review-card")).toHaveCount(9);
  await expect(apiPage.locator(".reviews-stats dd").first()).toContainText(
    seed.rating.toFixed(1).replace(".", ","),
  );
  await apiContext.close();
  checks.push(
    "Runtime API data and new local media appear without rebuilding; partial responses retain valid session data or bundled fallback; homepage all-reviews link navigates internally.",
  );

  expect(videoRequests).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        layouts,
        batches,
        errors,
        videoRequests,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, layouts: layouts.length, errors, videoRequests },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
