import { functions } from './app.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

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

if (downloadBtn && docId) {
  downloadBtn.addEventListener('click', async () => {
    // Show loading state
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "Generating PDF...";
    downloadBtn.disabled = true;
    downloadBtn.classList.add('opacity-50', 'cursor-not-allowed');
    
    try {
      console.log(`Triggering generatePDF for document: ${docId}`);
      const generatePDF = httpsCallable(functions, 'generatePDF');
      const result = await generatePDF({ docId });
      
      const downloadUrl = result.data.downloadUrl;
      const finalFileName = result.data.fileName || 'document_edited.pdf';
      if (!downloadUrl) {
        throw new Error("Signed download URL not returned from backend.");
      }
      
      // Trigger file download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = finalFileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
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
