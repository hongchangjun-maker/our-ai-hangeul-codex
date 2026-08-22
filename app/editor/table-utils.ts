export function rowsToTable(rows: string[][]) {
  const limited = rows.slice(0, 100).map((row) => row.slice(0, 20));
  return {
    type: 'table',
    content: limited.map((row, rowIndex) => ({ type: 'tableRow', content: row.map((cell) => ({ type: rowIndex === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: cell.slice(0, 10_000) }] : undefined }] })) })),
  };
}
