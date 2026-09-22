// Paste this whole file into the browser console.
// On localhost it downloads the cache. On tornops.vercel.app it imports it.
void (async () => {
  const databaseName = "tornops-attack-history";
  const storeName = "completed-wars";
  const productionHost = "tornops.vercel.app";
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

  if (!isLocal && location.hostname !== productionHost) {
    throw new Error("Run this only on localhost or tornops.vercel.app.");
  }

  const request = (idbRequest) =>
    new Promise((resolve, reject) => {
      idbRequest.onsuccess = () => resolve(idbRequest.result);
      idbRequest.onerror = () => reject(idbRequest.error);
    });

  const openDatabase = () =>
    new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(databaseName, 1);
      openRequest.onupgradeneeded = () => {
        openRequest.result.createObjectStore(storeName, { keyPath: "id" });
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

  let recordsToImport;
  if (!isLocal) {
    const file = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => resolve(input.files?.[0]);
      input.click();
    });
    if (!file) return;
    recordsToImport = JSON.parse(await file.text());
    if (
      !Array.isArray(recordsToImport) ||
      !recordsToImport.every(
        (record) => typeof record?.id === "string" && Array.isArray(record?.attacks),
      )
    ) {
      throw new Error("That file is not a TornOps attack-history export.");
    }
  }

  const database = await openDatabase();
  try {
    if (isLocal) {
      const records = await request(
        database.transaction(storeName).objectStore(storeName).getAll(),
      );
      const blob = new Blob([JSON.stringify(records)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "tornops-attack-history.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
      console.log(`Exported ${records.length} cached wars.`);
      return;
    }

    const transaction = database.transaction(storeName, "readwrite");
    for (const record of recordsToImport) {
      transaction.objectStore(storeName).put(record);
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    console.log(`Imported ${recordsToImport.length} cached wars. Reload the page.`);
  } finally {
    database.close();
  }
})();
