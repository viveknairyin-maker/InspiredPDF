import { getPDFFromIDB } from './app.js';

const downloadBtn = document.getElementById("downloadBtn") || document.getElementById("download-pdf-btn");
const toast = document.getElementById('toast');

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  
  if (isError) {
    toast.style.backgroundColor = '#ba1a1a'; // error red
    toast.style.color = '#ffffff';
    toast.style.borderColor = '#ba1a1a';
  } else {
    toast.style.backgroundColor = '#000000'; // primary black
    toast.style.color = '#ffffff';
    toast.style.borderColor = '#ffffff';
  }
  
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

async function loadOriginalPDFBytes() {
  const pdfStorageType = sessionStorage.getItem("inspiredpdf_storage");
  if (pdfStorageType === "indexeddb") {
    const bytes = await getPDFFromIDB();
    if (!bytes) {
      throw new Error("No PDF bytes found in IndexedDB");
    }
    return new Uint8Array(bytes);
  } else {
    const pdfDataUrl = sessionStorage.getItem("inspiredpdf_data");
    if (!pdfDataUrl) {
      throw new Error("No PDF data found in sessionStorage");
    }
    const base64 = pdfDataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

if (downloadBtn) {
  downloadBtn.addEventListener("click", async function() {
    downloadBtn.textContent = "Generating PDF...";
    downloadBtn.disabled = true;
    
    try {
      // Get original PDF bytes
      const pdfBytes = await loadOriginalPDFBytes();
      
      // Load with pdf-lib
      const { PDFDocument, rgb, StandardFonts } = PDFLib;
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      const edits = window.InspiredPDF.edits;
      const fontCache = {};
      
      for (const [blockId, edit] of Object.entries(edits)) {
        const page = pdfDoc.getPage(edit.pageNumber - 1);
        
        // Redact original text with white rectangle
        page.drawRectangle({
          x: edit.x - 1,
          y: edit.y - 2,
          width: edit.width + 2,
          height: edit.height + 4,
          color: rgb(1, 1, 1),
          opacity: 1
        });
        
        // Embed font (use standard fonts for reliability)
        let font;
        try {
          if (!fontCache[edit.fontFamily]) {
            // Try to fetch Google Font ttf
            const fontBytes = await fetchGoogleFontBytes(edit.fontFamily, edit.fontWeight);
            fontCache[edit.fontFamily] = await pdfDoc.embedFont(fontBytes);
          }
          font = fontCache[edit.fontFamily];
        } catch (e) {
          console.warn(`Could not embed custom Google Font ${edit.fontFamily}, falling back to Helvetica:`, e);
          font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
        
        // Parse color
        let color = rgb(0, 0, 0);
        if (edit.color && edit.color.startsWith("#")) {
          const r = parseInt(edit.color.slice(1, 3), 16) / 255;
          const g = parseInt(edit.color.slice(3, 5), 16) / 255;
          const b = parseInt(edit.color.slice(5, 7), 16) / 255;
          color = rgb(r, g, b);
        }
        
        // Draw new text
        page.drawText(edit.text, {
          x: edit.x,
          y: edit.y,
          size: edit.fontSize,
          font,
          color
        });
      }
      
      // Save and download
      const editedBytes = await pdfDoc.save();
      const blob = new Blob([editedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = sessionStorage.getItem("inspiredpdf_filename") || "document.pdf";
      a.download = name.replace(".pdf", "") + "_edited.pdf";
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast("Your PDF is ready!");
    } catch (err) {
      console.error(err);
      showToast("Download failed. Please try again.", true);
    } finally {
      downloadBtn.textContent = "Download PDF";
      downloadBtn.disabled = false;
    }
  });
}

async function fetchGoogleFontBytes(fontFamily, fontWeight) {
  const weight = fontWeight === "bold" ? "700" : "400";
  // Request Google Fonts using CSS v1 API (sometimes provides TTF links or fallback fonts)
  const cssUrl = `https://fonts.googleapis.com/css?family=${fontFamily.replace(/\s+/g, "+")}:${weight}`;
  const cssResp = await fetch(cssUrl);
  const css = await cssResp.text();
  const match = css.match(/url\((https:\/\/[^)]+\.ttf)\)/) || css.match(/url\((https:\/\/[^)]+)\)/);
  if (!match) throw new Error("Font URL not found");
  const fontResp = await fetch(match[1]);
  return await fontResp.arrayBuffer();
}
