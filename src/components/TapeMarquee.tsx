import { Scissors } from "lucide-react";

/** Две перекрещённые ленты-скотча с фактами о продукте, бегут навстречу друг другу. Декор: всё это есть и в тексте страницы. */
export default function TapeMarquee({ a, b }: { a: string[]; b: string[] }) {
  const band = (items: string[], cls: string) => {
    // Половина дорожки должна быть шире ленты даже на 4K, иначе справа пустота и рывок на стыке
    const half = [...items, ...items, ...items];
    return (
      <div className={`tape-band ${cls}`}>
        <div className="tape-track">
          {[...half, ...half].map((x, i) => (
            <span key={i}>
              {x}
              <Scissors aria-hidden="true" />
            </span>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="tapes" aria-hidden="true" data-loop>
      {band(a, "tape-band--a")}
      {band(b, "tape-band--b")}
    </div>
  );
}
