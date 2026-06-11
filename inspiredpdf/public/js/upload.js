import { saveDocument, mapFontToGoogleFont } from './app.js';

// DOM Elements
const uploadBtn = document.getElementById('uploadBtn');
const dropZone = document.getElementById('dropZone');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const pdfFileInput = document.getElementById('pdfFileInput');
const modalDropZone = document.getElementById('modalDropZone');
const fileNameDisplay = document.getElementById('fileName');
const uploadError = document.getElementById('upload-error');
const modalLoading = document.getElementById('modalLoading');
const modalLoadingText = document.getElementById('modalLoadingText');
const modalFooter = document.getElementById('modalFooter');
const modalUploadBtn = document.getElementById('modalUploadBtn');

let selectedFile = null;

// Helpers to show/hide error
function showError(message) {
  uploadError.textContent = message;
  uploadError.classList.remove('hidden');
}

function hideError() {
  uploadError.textContent = '';
  uploadError.classList.add('hidden');
}

// Modal open/close actions
function openModal() {
  modalOverlay.style.display = 'flex';
  hideError();
  selectedFile = null;
  pdfFileInput.value = '';
  fileNameDisplay.textContent = '';
  fileNameDisplay.classList.add('hidden');
  modalLoading.classList.add('hidden');
  modalFooter.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.style.display = 'none';
}

// Bind modal trigger buttons
if (uploadBtn) {
  uploadBtn.addEventListener("click", () => {
    openModal();
  });
}

if (modalClose) {
  modalClose.addEventListener("click", () => {
    closeModal();
  });
}

if (dropZone) {
  dropZone.addEventListener("click", () => {
    openModal();
  });
  
  // Wire drag & drop on landing page dropZone
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
  });
  
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove('active');
  });
  
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    openModal();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

// Close modal if clicked outside of container
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    closeModal();
  }
});

// File validation, local parsing, and saving to IndexedDB
async function handleFile(file) {
  if (!file) return;

  // Validate file type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showError('Please upload a valid PDF file.');
    selectedFile = null;
    fileNameDisplay.classList.add('hidden');
    return;
  }

  // Validate file size (25MB limit)
  if (file.size > 25 * 1024 * 1024) {
    showError('File too large. Maximum size is 25MB.');
    selectedFile = null;
    fileNameDisplay.classList.add('hidden');
    return;
  }

  hideError();
  selectedFile = file;
  fileNameDisplay.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  fileNameDisplay.classList.remove('hidden');

  try {
    // Show local loading screen
    modalLoading.classList.remove('hidden');
    modalFooter.classList.add('hidden');
    modalLoadingText.textContent = "Analyzing your PDF...";

    // Read file bytes locally
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        // Keep a copy of the ArrayBuffer before it gets detached by the PDF.js Web Worker
        const arrayBufferCopy = arrayBuffer.slice(0);
        
        // Parse PDF pages using PDF.js locally in the browser
        const pdfDoc = await pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useSystemFonts: false,
          disableFontFace: true,
          ignoreErrors: true
        }).promise;
        
        console.log(`Loaded PDF. Pages: ${pdfDoc.numPages}`);
        
        const pagesData = [];
        
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          const textContent = await page.getTextContent();
          
          const textBlocks = [];
          
          textContent.items.forEach((item, index) => {
            if (!item.str || item.str.trim() === '') return;
            
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const fontSize = Math.abs(transform[0]);
            const originalFont = item.fontName || 'Unknown';
            
            let fontName = originalFont;
            try {
              const fontObj = page.commonObjs.has(originalFont) ? page.commonObjs.get(originalFont) : null;
              if (fontObj && fontObj.name) {
                fontName = fontObj.name;
              }
            } catch (err) {
              console.warn("Could not extract font name:", err);
            }
            
            let fontWeight = fontName.toLowerCase().includes("bold") ? "bold" : "normal";
            let fontStyle = fontName.toLowerCase().includes("italic") ? "italic" : "normal";
            const matchedGoogleFont = mapFontToGoogleFont(fontName);
            
            textBlocks.push({
              id: `block_${i}_${index}`,
              text: item.str,
              x: x,
              y: y,
              width: item.width || 0,
              height: item.height || fontSize,
              fontSize: fontSize,
              originalFont: fontName,
              fontWeight: fontWeight,
              fontStyle: fontStyle,
              matchedGoogleFont: matchedGoogleFont
            });
          });
          
          pagesData.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            textBlocks: textBlocks
          });
        }
        
        // Create unique local document ID
        const docId = 'doc_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        const analysis = { pages: pagesData };
        
        // Save PDF file bytes and analysis locally in IndexedDB
        await saveDocument(docId, selectedFile.name, selectedFile.size, arrayBufferCopy, analysis);
        
        console.log(`Document saved locally with ID: ${docId}`);
        
        // Redirect to local editor page
        window.location.href = `/editor.html?docId=${docId}`;
      } catch (err) {
        console.error("Local parsing failed:", err);
        showError(`Failed to parse PDF: ${err.message}`);
        modalLoading.classList.add('hidden');
        modalFooter.classList.remove('hidden');
      }
    };
    
    reader.onerror = (err) => {
      console.error("Reader error:", err);
      showError("Failed to read file.");
      modalLoading.classList.add('hidden');
      modalFooter.classList.remove('hidden');
    };
    
    reader.readAsArrayBuffer(selectedFile);
  } catch (error) {
    console.error("Upload process failed:", error);
    showError(`Processing failed: ${error.message}`);
    modalLoading.classList.add('hidden');
    modalFooter.classList.remove('hidden');
  }
}

// Bind modal drop zone click and file input change
if (modalDropZone) {
  modalDropZone.addEventListener("click", () => {
    pdfFileInput.click();
  });

  modalDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    modalDropZone.style.borderColor = "#000";
  });

  modalDropZone.addEventListener("dragleave", () => {
    modalDropZone.style.borderColor = "";
  });

  modalDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    modalDropZone.style.borderColor = "";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

if (pdfFileInput) {
  pdfFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
}

// Modal upload submit button (fallback)
if (modalUploadBtn) {
  modalUploadBtn.addEventListener("click", () => {
    if (selectedFile) {
      handleFile(selectedFile);
    } else {
      pdfFileInput.click();
    }
  });
}
