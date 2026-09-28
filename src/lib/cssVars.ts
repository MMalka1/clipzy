import type { CSSProperties } from "react";

/** CSS-переменные в style без приведения типов в каждом месте: style={cssVars({ "--d": "200ms" })}. */
export const cssVars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;
