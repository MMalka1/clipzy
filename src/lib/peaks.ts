const MAX_DECODE_BYTES = 400 * 1024 * 1024;

/** Считает огибающую звука из видеофайла. null — если звука нет или файл слишком большой. */
export async function extractPeaks(file: File, count = 480): Promise<number[] | null> {
  if (file.size > MAX_DECODE_BYTES) return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / count) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < count; i++) {
      let max = 0;
      const start = i * block;
      // Прореживаем выборку — точности хватает, а работает в разы быстрее
      for (let j = 0; j < block; j += 16) {
        const v = Math.abs(data[start + j] ?? 0);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.max(0.04, p / top));
  } catch {
    return null;
  } finally {
    ctx.close();
  }
}
