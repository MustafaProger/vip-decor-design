import { ArrowUpRight } from "lucide-react";
import { Breadcrumbs } from "../components/Primitives";
import { Button, ButtonLink } from "../components/Button";
import Reviews from "../components/Reviews";
import { useStore } from "../lib/store";

export default function Projects() {
  const { discuss } = useStore();

  return (
    <div className="container projects-page reviews-page">
      <Breadcrumbs items={[{ label: "Отзывы клиентов" }]} />
      <Reviews variant="full" headingLevel={1} />
      <section className="reviews-page-cta" aria-labelledby="reviews-cta-title">
        <div>
          <p className="eyebrow">Начнём с вашей идеи</p>
          <h2 id="reviews-cta-title">Теперь — ваш интерьер</h2>
          <p>
            Расскажите о комнате и пожеланиях. Поможем выбрать ткани и продумать
            оформление окна.
          </p>
        </div>
        <div className="reviews-page-actions">
          <Button
            onClick={() => discuss("Оформление интерьера — отзывы клиентов")}
          >
            Обсудить мой заказ <ArrowUpRight size={19} />
          </Button>
          <ButtonLink to="/contacts" variant="secondary">
            Посетить шоурум <ArrowUpRight size={19} />
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
