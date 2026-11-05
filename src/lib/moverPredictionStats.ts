export function summarizeMoverPredictions(rows: Array<{ points: number | null }>) {
  const graded = rows.filter((row): row is { points: number } => row.points !== null);
  return {
    graded: graded.length,
    topThree: graded.filter((row) => row.points > 0).length,
    points: graded.reduce((total, row) => total + row.points, 0),
  };
}
