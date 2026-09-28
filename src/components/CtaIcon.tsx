import { ArrowRight, Scissors } from "lucide-react";

/** Иконка в кнопке-призыве: стрелка, а при наведении — ножницы «чикают» по пунктирной линии отреза. */
export default function CtaIcon() {
  return (
    <span className="cta-ic relative inline-block h-4 w-4 shrink-0" aria-hidden="true">
      <ArrowRight className="cta-arrow absolute inset-0 h-4 w-4" />
      <Scissors className="cta-scissors absolute inset-0 h-4 w-4" />
    </span>
  );
}
