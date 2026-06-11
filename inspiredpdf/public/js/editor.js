import { getPDFFromIDB } from './app.js';

// Load PDF from sessionStorage/IndexedDB
const pdfDataUrl = sessionStorage.getItem("inspiredpdf_data");
const pdfStorageType = sessionStorage.getItem("inspiredpdf_storage");
const pdfFileName = sessionStorage.getItem("inspiredpdf_filename") || "document.pdf";

if (!pdfDataUrl && pdfStorageType !== "indexeddb") {
  window.location.href = "/";
}

// Convert base64 dataURL to Uint8Array for PDF.js
function dataURLToUint8Array(dataURL) {
  const base64 = dataURL.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Load the PDF bytes
async function loadPDFBytes() {
  if (pdfStorageType === "indexeddb") {
    const bytes = await getPDFFromIDB();
    if (!bytes) {
      throw new Error("No PDF bytes found in IndexedDB");
    }
    return new Uint8Array(bytes);
  } else {
    return dataURLToUint8Array(pdfDataUrl);
  }
}

// Update filename in header
const docFilenameDisplay = document.getElementById('doc-filename-display') || document.getElementById("pdfFileName");
if (docFilenameDisplay) {
  docFilenameDisplay.textContent = pdfFileName;
}

// DOM Elements
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

// Editor local state refs (pointing to window.InspiredPDF)
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.0;

// Active editing state
let activeEditingDiv = null;
let activeOverlayDiv = null;
let activeBlockId = null;
let activeBlockObj = null;

// Common Google Fonts to pre-populate the toolbar list
const COMMON_GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 
  'Poppins', 'Oswald', 'Source Sans Pro', 'Raleway', 'PT Sans', 
  'Merriweather', 'Lora', 'Noto Sans', 'Nunito', 'Playfair Display', 
  'Ubuntu', 'Roboto Mono', 'Arimo', 'Rubik', 'DM Sans', 'JetBrains Mono'
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
      triggerEditSave(true);
    }
  };
}

// Populate font families in toolbar
function populateFontDropdown() {
  if (!fontFamilySelect) return;
  fontFamilySelect.innerHTML = '';
  COMMON_GOOGLE_FONTS.forEach(font => {
    const opt = document.createElement('option');
    opt.value = font;
    opt.textContent = font.toUpperCase();
    fontFamilySelect.appendChild(opt);
  });
}

// Dynamically inject Google Font stylesheets into the page head (Fix 1B.a)
function loadGoogleFont(fontName) {
  if (!fontName) return;
  const fontId = "gfont-" + fontName.replace(/\s+/g, "-");
  if (!document.getElementById(fontId)) {
    const link = document.createElement("link");
    link.id = fontId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
}

// Batched Gemini Font Analysis Call (Browser-Side)
async function analyzeFonts(uniqueFontNames) {
  const apiKey = window.GEMINI_API_KEY;
  if (!apiKey || apiKey === "__GEMINI_API_KEY__") {
    console.warn("No valid GEMINI_API_KEY found. Font matching disabled.");
    const fallback = {};
    uniqueFontNames.forEach(f => fallback[f] = "Inter");
    return fallback;
  }

  const fontList = uniqueFontNames.join("\n");
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a typography expert. Below is a list of internal PDF font names.
For each font name, return the closest matching Google Font from fonts.google.com.

Rules:
- Helvetica, Arial, or similar sans → "Inter"
- Times New Roman, serif variants → "Merriweather"  
- Geometric sans (Futura, Avenir) → "DM Sans"
- Monospace fonts → "JetBrains Mono"
- Display or decorative → "Playfair Display"
- Unknown → "Inter"

Font names:
${fontList}

Reply ONLY with a JSON object where keys are the original font names 
and values are the matched Google Font names. No explanation. 
Example: {"AAAAAB+Helvetica": "Inter", "TimesNewRoman": "Merriweather"}`
            }]
          }]
        })
      }
    );
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const fontMap = JSON.parse(clean);
    
    // Fill in any missing fonts with Inter
    uniqueFontNames.forEach(f => {
      if (!fontMap[f]) fontMap[f] = "Inter";
    });
    
    return fontMap;
  } catch (err) {
    console.warn("Font analysis failed, using defaults:", err);
    const fallback = {};
    uniqueFontNames.forEach(f => fallback[f] = "Inter");
    return fallback;
  }
}

// Start local editor initialization
async function initEditor() {
  populateFontDropdown();
  setActiveTool('selectEdit');
  
  try {
    editorLoadingScreen.classList.remove('hidden');
    editorLoadingText.textContent = "Loading local PDF...";

    const pdfBytes = await loadPDFBytes();
    window.InspiredPDF.pdfBytes = pdfBytes;
    
    // Initialize PDF.js local document
    pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    totalPages = pdfDoc.numPages;
    window.InspiredPDF.pdfDoc = pdfDoc;
    window.InspiredPDF.totalPages = totalPages;

    editorLoadingText.textContent = "Analyzing fonts & layout... this may take a few seconds.";

    // Perform Layout & Typography Analysis locally
    const pages = [];
    const uniqueFonts = new Set();
    
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      
      const width = viewport.width;
      const height = viewport.height;
      const blocks = [];
      
      textContent.items.forEach((item, index) => {
        if (!item.str || item.str.trim() === '') return;
        
        const transform = item.transform; // [scaleX, skewX, skewY, scaleY, transX, transY]
        const x = transform[4];
        const y = transform[5];
        const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
        const originalFont = item.fontName || 'Unknown';
        
        let fontName = originalFont;
        try {
          const fontObj = page.commonObjs.has(originalFont) ? page.commonObjs.get(originalFont) : null;
          if (fontObj && fontObj.name) {
            fontName = fontObj.name;
          }
        } catch (e) {
          console.warn(`Could not resolve font name for ${originalFont}:`, e.message);
        }
        
        let fontWeight = fontName.toLowerCase().includes("bold") ? "bold" : "normal";
        let fontStyle = fontName.toLowerCase().includes("italic") ? "italic" : "normal";
        
        uniqueFonts.add(fontName);
        
        blocks.push({
          id: `block_${i}_${index}`,
          text: item.str,
          x: x,
          y: y,
          width: item.width || 0,
          height: item.height || fontSize,
          fontSize: fontSize,
          originalFont: fontName,
          fontWeight: fontWeight,
          fontStyle: fontStyle
        });
      });
      
      pages.push({
        pageNumber: i,
        width: width,
        height: height,
        blocks: blocks
      });
    }

    // Call batched font mapper
    const fontMapping = await analyzeFonts(Array.from(uniqueFonts));

    // Construct analysis state payload
    const pagesData = pages.map(page => {
      const textBlocks = page.blocks.map(block => {
        const matched = fontMapping[block.originalFont] || 'Inter';
        return {
          ...block,
          matchedGoogleFont: matched
        };
      });
      
      return {
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        textBlocks: textBlocks
      };
    });
    
    window.InspiredPDF.analysis = {
      pages: pagesData
    };

    // Hide loading overlay
    editorLoadingScreen.classList.add('hidden');
    
    // Render first page
    renderPage(currentPage);
  } catch (error) {
    console.error("Local editor initialization failed:", error);
    editorLoadingText.textContent = `Editor initialization failed: ${error.message}`;
    const spinner = editorLoadingScreen.querySelector('.animate-spin');
    if (spinner) spinner.classList.add('hidden');
  }
}

// Render page canvas locally
async function renderPage(pageNumber) {
  if (!pdfDoc || !window.InspiredPDF.analysis) return;
  
  closeEditing();
  canvasContainer.innerHTML = '';
  
  const page = await pdfDoc.getPage(pageNumber);
  const analysisPage = window.InspiredPDF.analysis.pages.find(p => p.pageNumber === pageNumber);
  if (!analysisPage) {
    console.error(`No local analysis data found for page ${pageNumber}`);
    return;
  }
  
  scale = canvasContainer.clientWidth / analysisPage.width;
  const scaledViewport = page.getViewport({ scale: scale });
  
  canvasContainer.style.width = `${canvasContainer.clientWidth}px`;
  canvasContainer.style.height = `${analysisPage.height * scale}px`;
  
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
  
  renderOverlays(pageNumber, scale, analysisPage.height);
  
  if (pageInfo) {
    pageInfo.textContent = `PAGE ${pageNumber} OF ${totalPages}`;
  }
}

// Render local overlays
function renderOverlays(pageNumber, scale, pageHeight) {
  const analysisPage = window.InspiredPDF.analysis.pages[pageNumber - 1];
  
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
    const edit = window.InspiredPDF.edits[blockId];
    
    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay pointer-events-auto';
    overlay.dataset.blockId = blockId;
    
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
    
    const fontName = edit ? edit.fontFamily : block.matchedGoogleFont;
    loadGoogleFont(fontName);
    
    // Apply matching typography (Fix 1B.c)
    if (edit) {
      overlay.style.fontFamily = `'${edit.fontFamily || block.matchedGoogleFont}', sans-serif`;
      overlay.style.fontSize = `${(edit.fontSize || block.fontSize) * scale}px`;
      overlay.style.fontWeight = edit.fontWeight || block.fontWeight;
      overlay.style.fontStyle = edit.fontStyle || block.fontStyle;
      overlay.style.color = edit.color || '#000000';
      overlay.style.textDecoration = edit.underline ? 'underline' : 'none';
      overlay.innerText = edit.text;
    } else {
      overlay.style.fontFamily = `'${block.matchedGoogleFont}', sans-serif`;
      overlay.style.fontSize = `${block.fontSize * scale}px`;
      overlay.style.fontWeight = block.fontWeight;
      overlay.style.fontStyle = block.fontStyle;
      overlay.style.color = 'transparent';
      overlay.innerText = block.text;
    }
    
    // Ensure background is transparent before editing (Fix 1A)
    overlay.style.setProperty('background', 'transparent', 'important');
    overlay.style.setProperty('background-color', 'transparent', 'important');
    
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      activateEditBlock(block, scale);
    });
    
    overlaysDiv.appendChild(overlay);
  });
}

// In-place Text Editing Initiator
function activateEditBlock(block, scale) {
  closeEditing();
  setActiveTool('selectEdit');
  
  const blockId = block.id;
  const overlayDiv = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!overlayDiv) return;
  
  activeOverlayDiv = overlayDiv;
  activeBlockId = blockId;
  activeBlockObj = block;
  
  overlayDiv.classList.add('invisible');
  
  // Make sure background of original overlay is transparent (Fix 1A)
  overlayDiv.style.setProperty('background', 'transparent', 'important');
  overlayDiv.style.setProperty('background-color', 'transparent', 'important');
  
  const edit = window.InspiredPDF.edits[blockId];
  const fontName = edit ? edit.fontFamily : block.matchedGoogleFont;
  
  loadGoogleFont(fontName);
  
  const editDiv = document.createElement('div');
  editDiv.className = 'text-block-editing';
  editDiv.contentEditable = 'true';
  editDiv.style.position = 'absolute';
  editDiv.style.left = overlayDiv.style.left;
  editDiv.style.top = overlayDiv.style.top;
  editDiv.style.width = overlayDiv.style.width;
  editDiv.style.minHeight = overlayDiv.style.height;
  
  // Apply font and styles to contenteditable (Fix 1B.b)
  editDiv.style.fontFamily = `'${fontName}', sans-serif`;
  editDiv.style.fontSize = ((edit ? edit.fontSize : block.fontSize) * scale) + "px";
  editDiv.style.fontWeight = edit ? edit.fontWeight : block.fontWeight;
  editDiv.style.fontStyle = edit ? edit.fontStyle : block.fontStyle;
  const colorVal = edit ? (edit.color || block.color || "inherit") : (block.color || "inherit");
  editDiv.style.color = colorVal;
  editDiv.style.lineHeight = "1.2";
  editDiv.style.letterSpacing = "normal";
  editDiv.style.webkitTextFillColor = colorVal;
  
  // Force transparent backgrounds & remove boundaries/decorations (Fix 1A)
  editDiv.style.setProperty('background', 'transparent', 'important');
  editDiv.style.setProperty('background-color', 'transparent', 'important');
  editDiv.style.setProperty('border', 'none', 'important');
  editDiv.style.setProperty('outline', 'none', 'important');
  editDiv.style.setProperty('box-shadow', 'none', 'important');
  editDiv.style.setProperty('padding', '0', 'important');
  editDiv.style.setProperty('margin', '0', 'important');
  
  editDiv.innerText = edit ? edit.text : block.text;
  
  document.getElementById('overlays').appendChild(editDiv);
  activeEditingDiv = editDiv;
  
  editDiv.focus();
  const range = document.createRange();
  range.selectNodeContents(editDiv);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  positionToolbar(editDiv);
  
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
  const edit = window.InspiredPDF.edits[blockId];
  
  const fontFamily = edit ? edit.fontFamily : activeBlockObj.matchedGoogleFont;
  fontFamilySelect.value = fontFamily;
  
  const fontSize = edit ? edit.fontSize : activeBlockObj.fontSize;
  fontSizeInput.value = Math.round(fontSize);
  
  updateToolbarState();
  
  const color = edit ? (edit.color || '#000000') : '#000000';
  colorSwatchBtn.style.backgroundColor = color;
  colorHexInput.value = color.replace('#', '');
}

function updateToolbarState() {
  if (!activeEditingDiv) return;
  const isBold = activeEditingDiv.style.fontWeight === 'bold';
  const isItalic = activeEditingDiv.style.fontStyle === 'italic';
  const isUnderline = activeEditingDiv.style.textDecoration === 'underline';
  
  if (boldBtn) {
    boldBtn.classList.toggle('bg-primary', isBold);
    boldBtn.classList.toggle('text-on-primary', isBold);
  }
  if (italicBtn) {
    italicBtn.classList.toggle('bg-primary', isItalic);
    italicBtn.classList.toggle('text-on-primary', isItalic);
  }
  if (underlineBtn) {
    underlineBtn.classList.toggle('bg-primary', isUnderline);
    underlineBtn.classList.toggle('text-on-primary', isUnderline);
  }
}

// Close active edit, remove contenteditable and save final states
function closeEditing() {
  if (activeEditingDiv) {
    const text = activeEditingDiv.innerText;
    if (text !== '') {
      triggerEditSave(true);
    }
    
    activeEditingDiv.remove();
    activeEditingDiv = null;
  }
  
  if (activeOverlayDiv) {
    activeOverlayDiv.classList.remove('invisible');
    activeOverlayDiv = null;
  }
  
  if (floatingToolbar) floatingToolbar.style.display = 'none';
  if (colorPickerPopover) colorPickerPopover.classList.add('hidden');
  activeBlockId = null;
  activeBlockObj = null;
}

// Real-time debounced edits write (local memory object)
function triggerEditSave(immediate = false) {
  if (!activeEditingDiv || !activeBlockObj || !activeBlockId) return;
  
  const text = activeEditingDiv.innerText;
  const fontSize = parseFloat(fontSizeInput.value);
  const fontFamily = fontFamilySelect.value;
  const fontWeight = activeEditingDiv.style.fontWeight || 'normal';
  const fontStyle = activeEditingDiv.style.fontStyle || 'normal';
  const color = colorSwatchBtn.style.backgroundColor || '#000000';
  const underline = activeEditingDiv.style.textDecoration === 'underline';
  
  // Convert rgb(...) to hex
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
  
  window.InspiredPDF.edits[activeBlockId] = {
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
  };

  // Sync back to overlay Div immediately for live changes in editor view
  if (activeOverlayDiv) {
    activeOverlayDiv.innerText = text;
    activeOverlayDiv.style.fontFamily = `'${fontFamily}', sans-serif`;
    activeOverlayDiv.style.fontSize = `${fontSize * scale}px`;
    activeOverlayDiv.style.fontWeight = fontWeight;
    activeOverlayDiv.style.fontStyle = fontStyle;
    activeOverlayDiv.style.color = hexColor;
    activeOverlayDiv.style.textDecoration = underline ? 'underline' : 'none';
  }
}

// Floating Toolbar controls bindings
if (fontFamilySelect) {
  fontFamilySelect.onchange = () => {
    if (activeEditingDiv) {
      const font = fontFamilySelect.value;
      loadGoogleFont(font);
      activeEditingDiv.style.fontFamily = `"${font}", sans-serif`;
      triggerEditSave();
    }
  };
}

if (fontSizeInput) {
  fontSizeInput.oninput = () => {
    if (activeEditingDiv) {
      const size = parseFloat(fontSizeInput.value);
      activeEditingDiv.style.fontSize = `${size * scale}px`;
      triggerEditSave();
    }
  };
}

if (boldBtn) {
  boldBtn.onclick = () => {
    if (activeEditingDiv) {
      const isBold = activeEditingDiv.style.fontWeight === 'bold';
      activeEditingDiv.style.fontWeight = isBold ? 'normal' : 'bold';
      updateToolbarState();
      triggerEditSave();
    }
  };
}

if (italicBtn) {
  italicBtn.onclick = () => {
    if (activeEditingDiv) {
      const isItalic = activeEditingDiv.style.fontStyle === 'italic';
      activeEditingDiv.style.fontStyle = isItalic ? 'normal' : 'italic';
      updateToolbarState();
      triggerEditSave();
    }
  };
}

if (underlineBtn) {
  underlineBtn.onclick = () => {
    if (activeEditingDiv) {
      const isUnderline = activeEditingDiv.style.textDecoration === 'underline';
      activeEditingDiv.style.textDecoration = isUnderline ? 'none' : 'underline';
      updateToolbarState();
      triggerEditSave();
    }
  };
}

if (colorSwatchBtn) {
  colorSwatchBtn.onclick = (e) => {
    e.stopPropagation();
    if (colorPickerPopover) colorPickerPopover.classList.toggle('hidden');
  };
}

if (colorPickerPopover) {
  colorPickerPopover.querySelectorAll('[data-color]').forEach(btn => {
    btn.onclick = () => {
      const color = btn.dataset.color;
      colorSwatchBtn.style.backgroundColor = color;
      if (colorHexInput) colorHexInput.value = color.replace('#', '');
      if (activeEditingDiv) {
        activeEditingDiv.style.color = color;
        triggerEditSave();
      }
      colorPickerPopover.classList.add('hidden');
    };
  });
}

if (colorHexInput) {
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
}

// Close editing if user clicks outside of editing container or toolbar
window.addEventListener('mousedown', (e) => {
  if (activeEditingDiv) {
    if (!activeEditingDiv.contains(e.target) && 
        !(floatingToolbar && floatingToolbar.contains(e.target)) && 
        !(colorPickerPopover && colorPickerPopover.contains(e.target))) {
      closeEditing();
    }
  }
});

if (floatingToolbar) {
  floatingToolbar.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
}

// Page Navigation Bindings
if (prevPageBtn) {
  prevPageBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage(currentPage);
    }
  };
}

if (nextPageBtn) {
  nextPageBtn.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderPage(currentPage);
    }
  };
}

// Start the page logic
initEditor();
export { scale, currentPage };
