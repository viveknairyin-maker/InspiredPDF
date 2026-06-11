// Open IndexedDB database connection
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("InspiredPDF_LocalDB", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("edits")) {
        db.createObjectStore("edits", { keyPath: "docId" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Save document metadata and array buffer bytes locally
export async function saveDocument(docId, fileName, fileSize, fileBytes, analysis) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.put({
      id: docId,
      fileName,
      fileSize,
      fileBytes,
      analysis,
      status: "ready"
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get document metadata and bytes locally
export async function getDocument(docId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("documents", "readonly");
    const store = transaction.objectStore("documents");
    const request = store.get(docId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get all edits for a document locally
export async function getEdits(docId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("edits", "readonly");
    const store = transaction.objectStore("edits");
    const request = store.get(docId);
    request.onsuccess = () => {
      resolve(request.result ? request.result.edits : {});
    };
    request.onerror = () => reject(request.error);
  });
}

// Save a single text edit locally
export async function saveEdit(docId, blockId, editObj) {
  const db = await openDB();
  const currentEdits = await getEdits(docId);
  currentEdits[blockId] = editObj;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("edits", "readwrite");
    const store = transaction.objectStore("edits");
    const request = store.put({
      docId: docId,
      edits: currentEdits
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Local font heuristic mapper
export function mapFontToGoogleFont(fontName) {
  if (!fontName || fontName === 'Unknown') return 'Inter';
  
  let cleanName = fontName;
  if (fontName.includes('+')) {
    cleanName = fontName.split('+')[1];
  }
  cleanName = cleanName.split('-')[0].split(',')[0].toLowerCase().trim();
  
  if (cleanName.includes('arial') || cleanName.includes('helvetica') || cleanName.includes('sans')) {
    return 'Inter';
  }
  if (cleanName.includes('times') || cleanName.includes('georgia') || cleanName.includes('serif') || cleanName.includes('roman')) {
    return 'Merriweather';
  }
  if (cleanName.includes('courier') || cleanName.includes('mono') || cleanName.includes('consolas')) {
    return 'Roboto Mono';
  }
  if (cleanName.includes('roboto')) {
    return 'Roboto';
  }
  if (cleanName.includes('lato')) {
    return 'Lato';
  }
  if (cleanName.includes('montserrat')) {
    return 'Montserrat';
  }
  if (cleanName.includes('poppins')) {
    return 'Poppins';
  }
  
  return 'Inter';
}
