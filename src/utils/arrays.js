// Split an array into fixed-size chunks. Primarily used for Firestore
// `where(documentId(), 'in', [...])` batches, which cap at 10 ids.
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
