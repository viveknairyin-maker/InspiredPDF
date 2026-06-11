import { getDocument, getEdits } from './app.js';

const downloadBtn = document.getElementById('download-pdf-btn');
const toast = document.getElementById('toast');

// Fetch document ID from URL
const urlParams = new URLSearchParams(window.location.search);
const docId = urlParams.get('docId');

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

// Fetch Google Font TrueType binary data dynamically
async function downloadGoogleFontTtf(fontFamily, isBold = false, isItalic = false) {
  const formattedFont = fontFamily.replace(/\s+/g, '+');
  
  // Try Google Fonts CSS2 Endpoint
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${formattedFont}:${isBold ? 'ital,wght@1,700' : 'wght@400'}`;
    const cssResponse = await fetch(cssUrl);
    if (cssResponse.ok) {
      const cssText = await cssResponse.text();
      let fontUrlMatch = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/) || cssText.match(/url\((https:\/\/[^)]+)\)/);
      if (fontUrlMatch) {
        const fontUrl = fontUrlMatch[1];
        const fontResponse = await fetch(fontUrl);
        return await fontResponse.arrayBuffer();
      }
    }
  } catch (error) {
    console.warn(`Failed to download CSS2 for ${fontFamily}:`, error.message);
  }
  
  // Try older CSS Endpoint (Fallback)
  try {
    const fallbackCssUrl = `https://fonts.googleapis.com/css?family=${formattedFont}:${isBold ? '700' : '400'}${isItalic ? 'i' : ''}`;
    const cssResponse = await fetch(fallbackCssUrl);
    if (cssResponse.ok) {
      const cssText = await cssResponse.text();
      let fontUrlMatch = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/) || cssText.match(/url\((https:\/\/[^)]+)\)/);
      if (fontUrlMatch) {
        const fontUrl = fontUrlMatch[1];
        const fontResponse = await fetch(fontUrl);
        return await fontResponse.arrayBuffer();
      }
    }
  } catch (error) {
    console.error(`Failed to download fallback CSS for ${fontFamily}:`, error.message);
  }
  
  throw new Error(`Font file not found for ${fontFamily}`);
}

if (downloadBtn && docId) {
  downloadBtn.addEventListener('click', async () => {
    // Show loading state
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "Generating PDF...";
    downloadBtn.disabled = true;
    downloadBtn.classList.add('opacity-50', 'cursor-not-allowed');
    
    try {
      console.log(`Loading document bytes locally for: ${docId}`);
      
      // 1. Fetch document and edits from local IndexedDB
      const docData = await getDocument(docId);
      if (!docData) throw new Error("Local document data not found.");
      
      const edits = await getEdits(docId);
      
      // 2. Load PDF document into pdf-lib
      const { PDFDocument, rgb, StandardFonts } = PDFLib;
      const pdfDoc = await PDFDocument.load(docData.fileBytes);
      const pages = pdfDoc.getPages();
      
      // Cache for dynamically loaded Google Fonts
      const fontCache = {};
      
      const getFont = async (fontFamily, isBold, isItalic) => {
        const cacheKey = `${fontFamily}_${isBold ? 'B' : 'R'}_${isItalic ? 'I' : 'N'}`;
        if (fontCache[cacheKey]) return fontCache[cacheKey];
        
        try {
          const fontBytes = await downloadGoogleFontTtf(fontFamily, isBold, isItalic);
          const embeddedFont = await pdfDoc.embedFont(fontBytes);
          fontCache[cacheKey] = embeddedFont;
          return embeddedFont;
        } catch (e) {
          console.error(`Could not embed Google Font ${fontFamily}:`, e);
          // Fallback to standard Helvetica
          return await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
      };
      
      // 3. Apply all edits block by block
      for (const [blockId, editData] of Object.entries(edits)) {
        const pageIndex = editData.pageNumber - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) {
          console.warn(`Edit references invalid pageNumber: ${editData.pageNumber}`);
          continue;
        }
        
        const page = pages[pageIndex];
        
        // Draw white rectangle to redact the original text
        page.drawRectangle({
          x: editData.x,
          y: editData.y,
          width: editData.width,
          height: editData.height + 2,
          color: rgb(1, 1, 1),
          filled: true
        });
        
        // Load selected Google Font
        const isBold = editData.fontWeight === 'bold';
        const isItalic = editData.fontStyle === 'italic';
        const font = await getFont(editData.fontFamily || 'Inter', isBold, isItalic);
        
        // Parse Color (hex to rgb)
        let textColor = rgb(0, 0, 0); // default black
        if (editData.color) {
          try {
            const hex = editData.color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            textColor = rgb(r, g, b);
          } catch (colorError) {
            console.warn(`Failed to parse color ${editData.color}, using black`);
          }
        }
        
        // Draw the new text block
        page.drawText(editData.text, {
          x: editData.x,
          y: editData.y,
          size: editData.fontSize,
          font: font,
          color: textColor
        });
      }
      
      // 4. Save modified PDF bytes
      const outputBuffer = await pdfDoc.save();
      
      // 5. Trigger download directly in browser
      const blob = new Blob([outputBuffer], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const originalFilename = docData.fileName || 'document.pdf';
      const finalFilename = originalFilename.endsWith('.pdf') 
        ? `${originalFilename.slice(0, -4)}_edited.pdf` 
        : `${originalFilename}_edited.pdf`;
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      showToast("Your PDF is ready!");
    } catch (error) {
      console.error("PDF generation failed:", error);
      showToast("Download failed. Please try again.", true);
    } finally {
      // Restore button state
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  });
}
