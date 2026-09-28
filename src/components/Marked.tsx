/** Заголовок, в котором одно слово выделено маркером (при появлении маркер «проводится» по слову). */
export default function Marked({ text, mark }: { text: string; mark: string }) {
  const i = text.indexOf(mark);
  if (!mark || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="marker marker-swipe">{mark}</span>
      {text.slice(i + mark.length)}
    </>
  );
}
