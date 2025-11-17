function findLastUserIndex(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && entry.role === "user") {
      return index;
    }
  }
  return -1;
}

export { findLastUserIndex };
