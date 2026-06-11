const admin = require('firebase-admin');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const axios = require('axios');

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Genkit
const { configureGenkit } = require('@genkit-ai/core');
const { googleAI, gemini15Flash } = require('@genkit-ai/googleai');
const { generate } = require('@genkit-ai/ai');

configureGenkit({
  plugins: [googleAI()],
  logLevel: 'debug'
});

/**
 * Downloads a Google Font in TrueType (.ttf) format.
 * Scrapes Google Fonts using a User-Agent that triggers TTF file responses.
 */
async function downloadGoogleFontTtf(fontFamily, isBold = false, isItalic = false) {
  const formattedFont = fontFamily.replace(/\s+/g, '+');
  
  // Construct family URL with bold/italic variant if requested
  const variants = [];
  if (isItalic) variants.push('ital');
  variants.push('wght');
  
  const variantString = variants.length > 0 ? `:${variants.join(',')}@${isItalic ? '1,' : ''}${isBold ? '700' : '400'}` : '';
  const cssUrl = `https://fonts.googleapis.com/css2?family=${formattedFont}${variantString}&display=swap`;
  
  try {
    console.log(`Fetching CSS for font ${fontFamily} from url: ${cssUrl}`);
    const cssResponse = await axios.get(cssUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
      }
    });
    const ttfMatch = cssResponse.data.match(/src: url\(([^)]+\.ttf)\)/);
    const woffMatch = cssResponse.data.match(/src: url\(([^)]+\.woff2)\)/);
    const fontUrl = ttfMatch ? ttfMatch[1] : (woffMatch ? woffMatch[1] : null);
    
    if (fontUrl) {
      console.log(`Downloading font from direct URL: ${fontUrl}`);
      const fontResponse = await axios.get(fontUrl, { responseType: 'arraybuffer' });
      return fontResponse.data;
    }
  } catch (error) {
    console.warn(`Failed to fetch custom variant CSS: ${error.message}`);
  }
  
  // Generic family fallback if custom variant fails
  const genericCssUrl = `https://fonts.googleapis.com/css2?family=${formattedFont}&display=swap`;
  console.log(`Falling back to generic CSS URL: ${genericCssUrl}`);
  const cssResponse = await axios.get(genericCssUrl, {
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
    }
  });
  const ttfMatch = cssResponse.data.match(/src: url\(([^)]+\.ttf)\)/);
  const woffMatch = cssResponse.data.match(/src: url\(([^)]+\.woff2)\)/);
  const fontUrl = ttfMatch ? ttfMatch[1] : (woffMatch ? woffMatch[1] : null);
  
  if (!fontUrl) {
    throw new Error(`Font URL not found in CSS for ${fontFamily}`);
  }
  
  const fontResponse = await axios.get(fontUrl, { responseType: 'arraybuffer' });
  return fontResponse.data;
}

/**
 * Firestore onCreate Trigger: analyzePDF
 * Triggers automatically when a new document is created in the "documents" collection.
 */
exports.analyzePDF = onDocumentCreated({
  document: 'documents/{docId}',
  timeoutSeconds: 300, // Enforce 300s timeout as requested in Task 4
  memory: '512MiB'
}, async (event) => {
  const docId = event.params.docId;
  const snapshot = event.data;
  if (!snapshot) {
    console.error('No snapshot data found.');
    return;
  }
  
  const docData = snapshot.data();
  const storagePath = docData.storagePath;
  if (!storagePath) {
    console.error('Document storagePath is missing. Cannot proceed with analysis.');
    return;
  }
  
  const db = admin.firestore();
  const docRef = db.collection('documents').doc(docId);
  
  try {
    console.log(`Starting analysis for document: ${docId}, file: ${storagePath}`);
    
    // 1. Download file from Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [fileBuffer] = await file.download();
    
    // 2. Load PDF document using PDF.js
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      useSystemFonts: false,
      disableFontFace: true,
      ignoreErrors: true
    }).promise;
    
    console.log(`PDF loaded. Total pages: ${pdfDoc.numPages}`);
    
    const pages = [];
    const uniqueFonts = new Set();
    
    // 3. Extract text items and find all unique fonts
    for (let i = 1; i <= pdfDoc.numPages; i++) {
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
        // Enforce Task 4: fontSize is Math.abs(item.transform[0])
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
        
        // Clean font name (remove subset prefix if present, e.g., "AAAAAA+Arial" -> "Arial")
        let cleanFontName = fontName;
        if (fontName.includes('+')) {
          cleanFontName = fontName.split('+')[1];
        }
        
        // Enforce Task 4: Deduce font weight & style using resolved fontName
        let fontWeight = fontName.toLowerCase().includes("bold") ? "bold" : "normal";
        let fontStyle = fontName.toLowerCase().includes("italic") ? "italic" : "normal";
        
        uniqueFonts.add(fontName);
        
        // Enforce Task 4: id: "block_{pageNum}_{index}"
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
    
    // 4. Map each unique font to closest Google Font using Genkit AI
    console.log(`Unique fonts found:`, Array.from(uniqueFonts));
    const fontMapping = {};
    for (const fontName of uniqueFonts) {
      if (fontName === 'Unknown') {
        fontMapping[fontName] = 'Inter';
        continue;
      }
      
      let cleanFontName = fontName;
      if (fontName.includes('+')) {
        cleanFontName = fontName.split('+')[1];
      }
      // Remove style suffix (e.g. Arial-BoldMT -> Arial)
      cleanFontName = cleanFontName.split('-')[0];
      
      try {
        console.log(`Calling Genkit AI for font: ${cleanFontName}`);
        const response = await generate({
          model: gemini15Flash,
          prompt: `You are a typography expert. A PDF document uses an internal font named "${cleanFontName}". Internal PDF font names are often technical (e.g., "AAAAAB+Helvetica-Bold", "TimesNewRoman,Bold", "g_d0_f1").

Your job:
1. Strip any prefix codes (like "AAAAAB+") and suffixes.
2. Identify the base font family name.
3. Return the single closest Google Font available on fonts.google.com.

Rules:
- If it looks like Helvetica or Arial → return "Inter"
- If it looks like Times New Roman or a serif → return "Merriweather"  
- If it looks like a geometric sans → return "DM Sans"
- If it looks like a monospace → return "JetBrains Mono"
- If it looks like a display/decorative font → return "Playfair Display"
- Otherwise → return "Inter"

Reply with ONLY the Google Font name. No explanation. No punctuation.`
        });
        let matchedFont = response.text().trim();
        matchedFont = matchedFont.replace(/['"`]/g, ''); // Remove quotes
        
        fontMapping[fontName] = matchedFont || 'Inter';
        console.log(`Mapped: ${fontName} -> ${fontMapping[fontName]}`);
      } catch (error) {
        console.error(`Error mapping font ${fontName} with Genkit:`, error.message);
        fontMapping[fontName] = 'Inter'; // Fallback
      }
    }
    
    // 5. Build final pages and text blocks payload
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
    
    // 6. Update Firestore document
    await docRef.update({
      analysis: {
        pages: pagesData
      },
      status: 'ready'
    });
    console.log(`Document ${docId} analysis successfully completed!`);
  } catch (error) {
    console.error(`Analysis failed for document ${docId}:`, error);
    await docRef.update({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * HTTPS Callable Function: generatePDF
 * Redacts modified text blocks and overlays the edited text onto the original PDF.
 */
exports.generatePDF = onCall({
  timeoutSeconds: 300, // Enforce 300s timeout
  memory: '512MiB'
}, async (request) => {
  // Validate Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }
  
  const { docId } = request.data;
  if (!docId) {
    throw new HttpsError('invalid-argument', 'docId is required.');
  }
  
  const userId = request.auth.uid;
  const db = admin.firestore();
  
  try {
    // 1. Fetch document metadata
    const docSnap = await db.collection('documents').doc(docId).get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'Document metadata not found.');
    }
    
    const docData = docSnap.data();
    if (docData.userId !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this document.');
    }
    
    const storagePath = docData.storagePath;
    
    // 2. Fetch edits from subcollection
    const editsSnap = await db.collection('documents').doc(docId).collection('edits').get();
    const edits = {};
    editsSnap.forEach(snap => {
      edits[snap.id] = snap.data();
    });
    
    // If no edits, we can just return the original file or process it.
    console.log(`Edits to apply: ${Object.keys(edits).length}`);
    
    // 3. Download the original PDF
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [fileBuffer] = await file.download();
    
    // 4. Load the PDF using pdf-lib
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    
    // Cache for loaded Google Font objects to avoid downloading multiple times
    const fontCache = {};
    
    // Helper to get or download font
    const getFont = async (fontFamily) => {
      if (fontCache[fontFamily]) {
        return fontCache[fontFamily];
      }
      
      try {
        const cssUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, "+")}&display=swap`;
        const cssResponse = await axios.get(cssUrl, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const ttfMatch = cssResponse.data.match(/src: url\(([^)]+\.ttf)\)/);
        const woffMatch = cssResponse.data.match(/src: url\(([^)]+\.woff2)\)/);
        const fontUrl = ttfMatch ? ttfMatch[1] : (woffMatch ? woffMatch[1] : null);
        
        if (!fontUrl) {
          throw new Error("No font URL found");
        }
        
        console.log(`Downloading font from direct URL: ${fontUrl}`);
        const fontResponse = await axios.get(fontUrl, { responseType: 'arraybuffer' });
        const embeddedFont = await pdfDoc.embedFont(fontResponse.data);
        fontCache[fontFamily] = embeddedFont;
        return embeddedFont;
      } catch (e) {
        console.error(`Could not embed Google Font ${fontFamily}:`, e);
        // Fallback to standard Helvetica
        return await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
    };
    
    // 5. Apply Edits Page-by-Page
    for (const [blockId, edit] of Object.entries(edits)) {
      const pageIndex = edit.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) {
        console.warn(`Edit references invalid pageNumber: ${edit.pageNumber}`);
        continue;
      }
      
      const page = pages[pageIndex];
      
      // Draw a white rectangle to redact the original text
      page.drawRectangle({
        x: edit.x,
        y: edit.y - 2,
        width: edit.width + 2,
        height: edit.height + 4,
        color: rgb(1, 1, 1),
        opacity: 1
      });
      
      // Load selected Google Font
      const embeddedFont = await getFont(edit.fontFamily || 'Inter');
      
      // Draw the new text
      page.drawText(edit.text, {
        x: edit.x,
        y: edit.y,
        size: edit.fontSize,
        font: embeddedFont,
        color: hexToRgb(edit.color || "#000000")
      });
    }
    
    // 6. Save modified PDF to output buffer
    const outputBuffer = await pdfDoc.save();
    
    // 7. Save output PDF file to Storage
    const outputStoragePath = `outputs/${userId}/${docId}_edited.pdf`;
    const outputFile = bucket.file(outputStoragePath);
    await outputFile.save(Buffer.from(outputBuffer), {
      metadata: {
        contentType: 'application/pdf'
      }
    });
    
    // 8. Generate Signed URL valid for 10 minutes
    const [signedUrl] = await outputFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
    
    // Construct final output name
    let originalFilename = docData.fileName || 'document.pdf';
    if (originalFilename.endsWith('.pdf')) {
      originalFilename = originalFilename.slice(0, -4);
    }
    const finalFilename = `${originalFilename}_edited.pdf`;
    
    console.log(`Modified PDF saved to storage. Signed URL generated.`);
    
    // Enforce Task 6 response return format
    return {
      downloadUrl: signedUrl,
      fileName: finalFilename
    };
  } catch (error) {
    console.error(`Failed to generate PDF for document ${docId}:`, error);
    throw new HttpsError('internal', `Failed to generate PDF: ${error.message}`);
  }
});

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}
