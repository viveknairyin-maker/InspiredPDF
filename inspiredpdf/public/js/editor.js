import { db, storage, authPromise } from './app.js';
import { doc, collection, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, getBytes } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Fetch document ID from URL
const urlParams = new URLSearchParams(window.location.search);
const docId = urlParams.get('docId');

if (!docId) {
  alert("No document ID specified. Redirecting to landing page.");
  window.location.href = '/';
}

// DOM Elements
const docFilenameDisplay = document.getElementById('doc-filename-display');
const canvasContainer = document.getElementById('canvas-container');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const editorLoadingScreen = document.getElementById('editor-loading-screen');
const editorLoadingText = document.getElementById('editor-loading-text');

// Floating Toolbar DOM Elements
const floatingToolbar = document.getElementById('floating-toolbar');
const fontFamilySelect = document.getElementById('font-family-select');
const fontSizeInput = document.getElementById('font-size-input');
const boldBtn = document.getElementById('bold-btn');
const italicBtn = document.getElementById('italic-btn');
const underlineBtn = document.getElementById('underline-btn');
const colorSwatchBtn = document.getElementById('color-swatch-btn');
const colorPickerPopover = document.getElementById('color-picker-popover');
const colorHexInput = document.getElementById('color-hex-input');

// Editor state
let docData = null;
let analysis = null;
let docEdits = {};
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.0;
let analysisTimeout = null;

// Active editing state
let activeEditingDiv = null;
let activeOverlayDiv = null;
let activeBlockId = null;
let activeBlockObj = null;

// Common Google Fonts to pre-populate the toolbar list
const COMMON_GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 
  'Poppins', 'Oswald', 'Source Sans Pro', 'Slabo 27px', 
  'Raleway', 'PT Sans', 'Merriweather', 'Lora', 'Noto Sans',
  'Nunito', 'Playfair Display', 'Ubuntu', 'Roboto Mono', 
  'Arimo', 'Rubik'
];

// Sidebar tools binding
const sidebarTools = {
  selectEdit: document.getElementById('tool-select-edit'),
  changeFont: document.getElementById('tool-change-font'),
  changeSize: document.getElementById('tool-change-size'),
  changeColor: document.getElementById('tool-change-color'),
  boldItalic: document.getElementById('tool-bold-italic')
};

function setActiveTool(toolKey) {
  Object.entries(sidebarTools).forEach(([key, element]) => {
    if (!element) return;
    if (key === toolKey) {
      element.classList.add('bg-primary', 'text-on-primary');
      element.classList.remove('text-primary', 'hover:bg-secondary-container');
    } else {
      element.classList.remove('bg-primary', 'text-on-primary');
      element.classList.add('text-primary', 'hover:bg-secondary-container');
    }
  });
}

if (sidebarTools.selectEdit) sidebarTools.selectEdit.onclick = () => setActiveTool('selectEdit');
if (sidebarTools.changeFont) {
  sidebarTools.changeFont.onclick = () => {
    setActiveTool('changeFont');
    if (activeEditingDiv) fontFamilySelect.focus();
  };
}
if (sidebarTools.changeSize) {
  sidebarTools.changeSize.onclick = () => {
    setActiveTool('changeSize');
    if (activeEditingDiv) fontSizeInput.focus();
  };
}
if (sidebarTools.changeColor) {
  sidebarTools.changeColor.onclick = () => {
    setActiveTool('changeColor');
    if (activeEditingDiv) colorPickerPopover.classList.toggle('hidden');
  };
}
if (sidebarTools.boldItalic) {
  sidebarTools.boldItalic.onclick = () => {
    setActiveTool('boldItalic');
    if (activeEditingDiv) {
      const isBold = activeEditingDiv.style.fontWeight === 'bold';
      activeEditingDiv.style.fontWeight = isBold ? 'normal' : 'bold';
      updateToolbarState();
      triggerEditSave();
    }
  };
}

// Populate font families in toolbar
function populateFontDropdown() {
  fontFamilySelect.innerHTML = '';
  COMMON_GOOGLE_FONTS.forEach(font => {
    const opt = document.createElement('option');
    opt.value = font;
    opt.textContent = font.toUpperCase();
    fontFamilySelect.appendChild(opt);
  });
}

// Dynamically inject Google Font stylesheets into the page head
function loadGoogleFont(fontFamily) {
  if (!fontFamily) return;
  const formattedFont = fontFamily.replace(/\s+/g, '+');
  const linkId = `gfont-${formattedFont}`;
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${formattedFont}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
    document.head.appendChild(link);
  }
}

// Start document metadata listener
async function initEditor() {
  populateFontDropdown();
  setActiveTool('selectEdit');
  
  await authPromise;
  
  // Set analysis 30s timeout check (Task 5.2)
  analysisTimeout = setTimeout(() => {
    if (!analysis) {
      editorLoadingScreen.classList.remove('hidden');
      editorLoadingText.textContent = "Analysis is taking longer than expected. Please refresh.";
      const spinner = editorLoadingScreen.querySelector('.animate-spin');
      if (spinner) spinner.classList.add('hidden');
    }
  }, 30000);

  // Subscribe to document metadata changes (Task 5.2)
  const docRef = doc(db, 'documents', docId);
  onSnapshot(docRef, async (snapshot) => {
    if (!snapshot.exists()) {
      alert("Document not found.");
      window.location.href = '/';
      return;
    }
    
    docData = snapshot.data();
    docFilenameDisplay.textContent = docData.fileName || 'Untitled.pdf';
    
    if (docData.status === 'processing') {
      editorLoadingScreen.classList.remove('hidden');
      editorLoadingText.textContent = "Analyzing your PDF... this may take up to 30 seconds.";
    } else if (docData.status === 'ready' && docData.analysis && !analysis) {
      clearTimeout(analysisTimeout);
      analysis = docData.analysis;
      
      // Load edits subcollection
      subscribeToEdits();
      
      // Load and render PDF
      await loadPDF();
    } else if (docData.status === 'error') {
      clearTimeout(analysisTimeout);
      editorLoadingText.textContent = `Analysis failed: ${docData.error || 'Unknown error'}`;
      const spinner = editorLoadingScreen.querySelector('.animate-spin');
      if (spinner) spinner.classList.add('hidden');
    }
  });
}

// Load edits subcollection in real time
function subscribeToEdits() {
  const editsRef = collection(db, 'documents', docId, 'edits');
  onSnapshot(editsRef, (snapshot) => {
    docEdits = {};
    snapshot.forEach(docSnap => {
      docEdits[docSnap.id] = docSnap.data();
    });
    
    // Re-render the page to apply changes
    if (pdfDoc) {
      renderPage(currentPage);
    }
  });
}

// Download PDF bytes and load PDF.js (Task 5.3)
async function loadPDF() {
  try {
    editorLoadingText.textContent = "Loading PDF viewer...";
    
    const fileRef = ref(storage, docData.storagePath);
    const bytes = await getBytes(fileRef);
    
    // Load PDF document
    pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    totalPages = pdfDoc.numPages;
    
    // Hide loading screen
    editorLoadingScreen.classList.add('hidden');
    
    // Render first page
    renderPage(currentPage);
  } catch (error) {
    console.error("Error loading PDF:", error);
    editorLoadingText.textContent = `Error loading PDF: ${error.message}`;
    const spinner = editorLoadingScreen.querySelector('.animate-spin');
    if (spinner) spinner.classList.add('hidden');
  }
}

// Render page canvas (Task 5.4)
async function renderPage(pageNumber) {
  if (!pdfDoc || !analysis) return;
  
  // Clean up existing elements
  closeEditing();
  canvasContainer.innerHTML = '';
  
  // Get page info
  const page = await pdfDoc.getPage(pageNumber);
  const analysisPage = analysis.pages.find(p => p.pageNumber === pageNumber);
  if (!analysisPage) {
    console.error(`No analysis data found for page ${pageNumber}`);
    return;
  }
  
  // Calculate scaling factor to fit our A4 container width
  scale = canvasContainer.clientWidth / analysisPage.width;
  
  const scaledViewport = page.getViewport({ scale: scale });
  
  // Update page container dimensions
  canvasContainer.style.width = `${canvasContainer.clientWidth}px`;
  canvasContainer.style.height = `${analysisPage.height * scale}px`;
  
  // Render PDF.js page onto canvas
  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvasContainer.appendChild(canvas);
  
  const renderContext = {
    canvasContext: canvas.getContext('2d'),
    viewport: scaledViewport
  };
  await page.render(renderContext).promise;
  
  // Render overlay elements (Task 5.5)
  renderOverlays(pageNumber, scale, analysisPage.height);
  
  // Update bottom page indicators
  pageInfo.textContent = `PAGE ${pageNumber} OF ${totalPages}`;
}

// Render overlays (Task 5.5)
function renderOverlays(pageNumber, scale, pageHeight) {
  const analysisPage = analysis.pages[pageNumber - 1];
  
  // Create relative overlays container
  const overlaysDiv = document.createElement('div');
  overlaysDiv.id = 'overlays';
  overlaysDiv.style.position = 'absolute';
  overlaysDiv.style.top = '0';
  overlaysDiv.style.left = '0';
  overlaysDiv.style.width = '100%';
  overlaysDiv.style.height = '100%';
  overlaysDiv.style.zIndex = '10';
  overlaysDiv.className = 'pointer-events-none';
  canvasContainer.appendChild(overlaysDiv);
  
  analysisPage.textBlocks.forEach((block) => {
    const blockId = block.id;
    const edit = docEdits[blockId];
    
    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay pointer-events-auto'; // Enforce Task 5.5 class
    overlay.dataset.blockId = blockId;
    
    // Position using scaled top-left coordinates
    const left = block.x * scale;
    const top = (pageHeight - block.y - block.height) * scale;
    const width = block.width * scale;
    const height = block.height * scale;
    
    overlay.style.position = 'absolute';
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.cursor = 'text';
    
    // Font parameters
    const fontFamily = edit ? edit.fontFamily : block.matchedGoogleFont;
    loadGoogleFont(fontFamily);
    
    overlay.style.fontFamily = `"${fontFamily}", sans-serif`;
    overlay.style.fontSize = `${(edit ? edit.fontSize : block.fontSize) * scale}px`;
    overlay.style.fontWeight = edit ? edit.fontWeight : block.fontWeight;
    overlay.style.fontStyle = edit ? edit.fontStyle : block.fontStyle;
    
    if (edit) {
      // Redact original text: solid white background and visible edited text
      overlay.style.backgroundColor = '#ffffff';
      overlay.style.color = edit.color || '#000000';
      overlay.style.textDecoration = edit.underline ? 'underline' : 'none';
      overlay.innerText = edit.text;
    } else {
      // Transparent overlay to reveal original PDF text underneath
      overlay.style.backgroundColor = 'transparent';
      overlay.style.color = 'transparent';
      overlay.innerText = block.text;
    }
    
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      activateEditBlock(block, scale);
    });
    
    overlaysDiv.appendChild(overlay);
  });
}

// In-place Text Editing Initiator (Task 5.6)
function activateEditBlock(block, scale) {
  closeEditing(); // Close any currently active edit
  
  setActiveTool('selectEdit');
  
  const blockId = block.id;
  const overlayDiv = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!overlayDiv) return;
  
  activeOverlayDiv = overlayDiv;
  activeBlockId = blockId;
  activeBlockObj = block;
  
  // Hide overlay div
  overlayDiv.classList.add('invisible');
  
  const edit = docEdits[blockId];
  
  // Create contenteditable div
  const editDiv = document.createElement('div');
  editDiv.className = 'text-block-editing';
  editDiv.contentEditable = 'true';
  editDiv.style.position = 'absolute';
  editDiv.style.left = overlayDiv.style.left;
  editDiv.style.top = overlayDiv.style.top;
  editDiv.style.width = overlayDiv.style.width;
  editDiv.style.minHeight = overlayDiv.style.height;
  editDiv.style.fontFamily = overlayDiv.style.fontFamily;
  editDiv.style.fontSize = overlayDiv.style.fontSize;
  editDiv.style.fontWeight = overlayDiv.style.fontWeight;
  editDiv.style.fontStyle = overlayDiv.style.fontStyle;
  editDiv.style.textDecoration = overlayDiv.style.textDecoration;
  editDiv.style.color = edit ? (edit.color || '#000000') : '#000000';
  
  editDiv.innerText = edit ? edit.text : block.text;
  
  document.getElementById('overlays').appendChild(editDiv);
  activeEditingDiv = editDiv;
  
  // Focus and select all content
  editDiv.focus();
  const range = document.createRange();
  range.selectNodeContents(editDiv);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  // Show and position floating toolbar
  positionToolbar(editDiv);
  
  // Bind live inputs
  editDiv.addEventListener('input', () => {
    triggerEditSave();
  });
}

// Position Floating Toolbar above editing text block
function positionToolbar(editingDiv) {
  floatingToolbar.style.display = 'flex';
  const rect = editingDiv.getBoundingClientRect();
  const mainRect = document.getElementById('workspace-main').getBoundingClientRect();
  
  const left = rect.left - mainRect.left + (rect.width - floatingToolbar.offsetWidth) / 2;
  const top = rect.top - mainRect.top - floatingToolbar.offsetHeight - 12;
  
  floatingToolbar.style.left = `${Math.max(16, left)}px`;
  floatingToolbar.style.top = `${Math.max(16, top)}px`;
  
  updateToolbarControls();
}

// Sync values from active editing block to toolbar inputs
function updateToolbarControls() {
  if (!activeEditingDiv || !activeBlockObj) return;
  
  const blockId = activeBlockId;
  const edit = docEdits[blockId];
  
  // Font family dropdown
  const fontFamily = edit ? edit.fontFamily : activeBlockObj.matchedGoogleFont;
  fontFamilySelect.value = fontFamily;
  
  // Font size
  const fontSize = edit ? edit.fontSize : activeBlockObj.fontSize;
  fontSizeInput.value = Math.round(fontSize);
  
  // Update styling buttons selection states
  updateToolbarState();
  
  // Color Swatch
  const color = edit ? (edit.color || '#000000') : '#000000';
  colorSwatchBtn.style.backgroundColor = color;
  colorHexInput.value = color.replace('#', '');
}

function updateToolbarState() {
  if (!activeEditingDiv) return;
  const isBold = activeEditingDiv.style.fontWeight === 'bold';
  const isItalic = activeEditingDiv.style.fontStyle === 'italic';
  const isUnderline = activeEditingDiv.style.textDecoration === 'underline';
  
  boldBtn.classList.toggle('bg-primary', isBold);
  boldBtn.classList.toggle('text-on-primary', isBold);
  
  italicBtn.classList.toggle('bg-primary', isItalic);
  italicBtn.classList.toggle('text-on-primary', isItalic);
  
  underlineBtn.classList.toggle('bg-primary', isUnderline);
  underlineBtn.classList.toggle('text-on-primary', isUnderline);
}

// Close active edit, remove contenteditable and save final states
function closeEditing() {
  if (activeEditingDiv) {
    const text = activeEditingDiv.innerText;
    if (text !== '') {
      triggerEditSave(true); // Save immediately
    }
    
    activeEditingDiv.remove();
    activeEditingDiv = null;
  }
  
  if (activeOverlayDiv) {
    activeOverlayDiv.classList.remove('invisible');
    activeOverlayDiv = null;
  }
  
  floatingToolbar.style.display = 'none';
  colorPickerPopover.classList.add('hidden');
  activeBlockId = null;
  activeBlockObj = null;
}

// Real-time debounced edits write (Task 5.6.h)
let debounceTimer = null;
function triggerEditSave(immediate = false) {
  if (!activeEditingDiv || !activeBlockObj || !activeBlockId) return;
  
  clearTimeout(debounceTimer);
  
  const text = activeEditingDiv.innerText;
  const fontSize = parseFloat(fontSizeInput.value);
  const fontFamily = fontFamilySelect.value;
  const fontWeight = activeEditingDiv.style.fontWeight || 'normal';
  const fontStyle = activeEditingDiv.style.fontStyle || 'normal';
  const color = colorSwatchBtn.style.backgroundColor || '#000000';
  const underline = activeEditingDiv.style.textDecoration === 'underline';
  
  const save = async () => {
    // Check color format (converts rgb(...) to hex)
    let hexColor = color;
    if (color.startsWith('rgb')) {
      const parts = color.match(/\d+/g);
      if (parts && parts.length >= 3) {
        const r = parseInt(parts[0]).toString(16).padStart(2, '0');
        const g = parseInt(parts[1]).toString(16).padStart(2, '0');
        const b = parseInt(parts[2]).toString(16).padStart(2, '0');
        hexColor = `#${r}${g}${b}`;
      }
    }
    
    try {
      const editRef = doc(db, 'documents', docId, 'edits', activeBlockId);
      // Enforce Task 5.6.h Firestore edit payload exactly
      await setDoc(editRef, {
        text: text,
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        color: hexColor,
        underline: underline,
        x: activeBlockObj.x,
        y: activeBlockObj.y,
        width: activeBlockObj.width,
        height: activeBlockObj.height,
        pageNumber: currentPage
      }, { merge: true });
    } catch (e) {
      console.error("Failed to save edit to Firestore:", e);
    }
  };
  
  if (immediate) {
    save();
  } else {
    debounceTimer = setTimeout(save, 500);
  }
}

// Floating Toolbar controls bindings (Task 5.7)
fontFamilySelect.onchange = () => {
  if (activeEditingDiv) {
    const font = fontFamilySelect.value;
    loadGoogleFont(font);
    activeEditingDiv.style.fontFamily = `"${font}", sans-serif`;
    triggerEditSave();
  }
};

fontSizeInput.oninput = () => {
  if (activeEditingDiv) {
    const size = parseFloat(fontSizeInput.value);
    activeEditingDiv.style.fontSize = `${size * scale}px`;
    triggerEditSave();
  }
};

boldBtn.onclick = () => {
  if (activeEditingDiv) {
    const isBold = activeEditingDiv.style.fontWeight === 'bold';
    activeEditingDiv.style.fontWeight = isBold ? 'normal' : 'bold';
    updateToolbarState();
    triggerEditSave();
  }
};

italicBtn.onclick = () => {
  if (activeEditingDiv) {
    const isItalic = activeEditingDiv.style.fontStyle === 'italic';
    activeEditingDiv.style.fontStyle = isItalic ? 'normal' : 'italic';
    updateToolbarState();
    triggerEditSave();
  }
};

underlineBtn.onclick = () => {
  if (activeEditingDiv) {
    const isUnderline = activeEditingDiv.style.textDecoration === 'underline';
    activeEditingDiv.style.textDecoration = isUnderline ? 'none' : 'underline';
    updateToolbarState();
    triggerEditSave();
  }
};

colorSwatchBtn.onclick = (e) => {
  e.stopPropagation();
  colorPickerPopover.classList.toggle('hidden');
};

// Swatches selection inside custom popover
colorPickerPopover.querySelectorAll('[data-color]').forEach(btn => {
  btn.onclick = () => {
    const color = btn.dataset.color;
    colorSwatchBtn.style.backgroundColor = color;
    colorHexInput.value = color.replace('#', '');
    if (activeEditingDiv) {
      activeEditingDiv.style.color = color;
      triggerEditSave();
    }
    colorPickerPopover.classList.add('hidden');
  };
});

colorHexInput.oninput = () => {
  const hex = colorHexInput.value.replace('#', '');
  if (hex.length === 6) {
    const color = `#${hex}`;
    colorSwatchBtn.style.backgroundColor = color;
    if (activeEditingDiv) {
      activeEditingDiv.style.color = color;
      triggerEditSave();
    }
  }
};

// Close editing if user clicks outside of editing container or toolbar
window.addEventListener('mousedown', (e) => {
  if (activeEditingDiv) {
    if (!activeEditingDiv.contains(e.target) && 
        !floatingToolbar.contains(e.target) && 
        !colorPickerPopover.contains(e.target)) {
      closeEditing();
    }
  }
});

// Prevent toolbar clicks from blurring active inputs
floatingToolbar.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

// Page Navigation Bindings (Task 5.9)
prevPageBtn.onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
};

nextPageBtn.onclick = () => {
  if (currentPage < totalPages) {
    currentPage++;
    renderPage(currentPage);
  }
};

// Start the page logic
initEditor();
export { scale, currentPage };
