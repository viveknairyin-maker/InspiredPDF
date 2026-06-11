// Global state — everything lives here during the session
window.InspiredPDF = {
  pdfFile: null,        // The raw File object from the input
  pdfBytes: null,       // ArrayBuffer of the PDF
  pdfDoc: null,         // PDF.js document object
  totalPages: 0,
  currentPage: 1,
  analysis: null,       // { pages: [...] } from font analysis
  edits: {},            // { blockId: { text, fontSize, fontFamily, ... } }
  activeBlock: null     // Currently selected text block
};

export function storePDFInIDB(buffer) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("InspiredPDF", 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore("files");
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(buffer, "current");
      tx.oncomplete = resolve;
      tx.onerror = reject;
    };
    req.onerror = reject;
  });
}

export function getPDFFromIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("InspiredPDF", 1);
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction("files", "readonly");
      const getReq = tx.objectStore("files").get("current");
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = reject;
    };
    req.onerror = reject;
  });
}
