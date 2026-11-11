// The tour's stops as parts of its total time, for the thin bar under each stop.

/** "1:15" as seconds. */
export function secondsOf(time: string) {
  const [minutes, seconds] = time.split(":").map(Number);
  return minutes * 60 + seconds;
}

/** Where each stop starts and how much of the total it takes, both as fractions of 1. */
export function stopShares(times: readonly string[], total: string) {
  const all = secondsOf(total);
  let start = 0;
  return times.map((time) => {
    const size = secondsOf(time) / all;
    const share = { from: start, size };
    start += size;
    return share;
  });
}
