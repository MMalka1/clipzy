/**
 * Структурированные данные для поисковиков (schema.org) — невидимый тег script.
 * «<» экранируем: иначе строка вида «</script>» в тексте закрыла бы тег.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
