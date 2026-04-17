import {
  collection,
  documentId,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { chunk } from './arrays.js';

// Batch-fetch docs from a collection by id. Firestore caps `in` queries
// at 10, so we chunk and run the batches in parallel.
export async function fetchByIds(collectionName, ids) {
  if (!ids?.length) return [];
  const snaps = await Promise.all(
    chunk(ids, 10).map((part) =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', part)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.forEach((d) => out.push({ id: d.id, ...d.data() })));
  return out;
}
