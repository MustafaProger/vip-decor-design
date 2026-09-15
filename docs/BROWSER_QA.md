# Проверка приложения в браузере

Дата: 2026-09-15T09:37:02.490Z. Адрес: http://127.0.0.1:5180. Chrome 152.0.7977.83.

Проверено 41 исходных страниц и 36 категорий (адреса категорий входят в исходные страницы), а также 16 дополнительных маршрутов. Всего 57 уникальных маршрутов на 320 и 1440 px. Основные страницы также проверены на 390, 768, 1024 и 1920 px.

Проверки страниц: 146/146 пройдено. Axe WCAG A/AA: 14/14 без нарушений. Сценарии: 5/5 пройдено.

## Обнаруженные проблемы

- Переполнение, ошибки исполнения, отсутствие H1 или страницы 404 не обнаружены.

## Сценарии

- PASS — Mobile menu keyboard, focus, Escape and navigation: Keyboard opening; 14 Tabs never focus background page content (native Chrome may move focus to browser controls); Escape closes and restores focus; a menu link navigates and closes the menu.
- PASS — Catalog price/category/search filters and URL persistence: URL persistence and reload; filter chip removal; reset; known query; empty query results.
- PASS — Mobile filter modal: 320px filter modal fits the viewport; price changes persist in URL; apply closes the modal; Escape restores focus.
- PASS — Favorites persistence and empty state: Added "SMOOTH"; checked button state and header counter; favorites page and reload preserve it; removal restores empty state. User profile was untouched.
- PASS — Selection illustration and form bounds across six widths: Illustration never overlaps questions on steps 1 and 4 at all six widths; no form submission was attempted.

## Повторный запуск и границы проверки

`QA_BASE_URL=http://127.0.0.1:5180 npm run qa` — приложение должно уже работать. По умолчанию используется этот же адрес и установленный Chrome. `QA_BROWSER_CHANNEL` позволяет выбрать другой установленный канал Chromium.
`QA_SCENARIOS_ONLY=1 npm run qa` повторяет только сценарии, сохраняя предыдущие результаты маршрутов и Axe в отчёте с исходной датой; используйте после исправления тестов или для проверки взаимодействий без изменений общих страниц.

Скрипт создаёт отдельный временный профиль, блокирует все запросы, кроме GET/HEAD/OPTIONS, и не отправляет заявки, сообщения, заказы или платежи. Избранное изменяется только внутри этого профиля. Товар, оформление и бизнес-логика калькулятора проверяются отдельно.

Автоматическая проверка Axe не заменяет ручную оценку экранным диктором. Прохождение маршрутов не доказывает полный перенос каждого фрагмента исходного сайта и не подтверждает рабочие интеграции или публикацию.

Полные результаты каждого маршрута, ширины, нарушения Axe и сценария: [BROWSER_QA.json](BROWSER_QA.json).
