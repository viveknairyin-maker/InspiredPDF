import { storePDFInIDB } from './app.js';

(function() {
  // Elements
  const uploadBtn = document.getElementById("uploadBtn");
  const dropZone = document.getElementById("dropZone");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const modalDropZone = document.getElementById("modalDropZone");
  const uploadSubmitBtn = document.getElementById("uploadSubmitBtn") || document.getElementById("modalUploadBtn");
  const errorMsg = document.getElementById("uploadError") || document.getElementById("upload-error");

  // Use existing file input or create one if not found
  let fileInput = document.getElementById("pdfFileInput");
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf";
    fileInput.style.display = "none";
    fileInput.id = "pdfFileInput";
    document.body.appendChild(fileInput);
  }

  let selectedFile = null;

  // ---- MODAL OPEN/CLOSE ----
  function openModal() {
    if (modalOverlay) modalOverlay.style.display = "flex";
  }
  function closeModal() {
    if (modalOverlay) modalOverlay.style.display = "none";
    selectedFile = null;
    if (errorMsg) errorMsg.textContent = "";
  }

  // Landing page button opens modal
  if (uploadBtn) uploadBtn.addEventListener("click", openModal);

  // Landing page dropzone opens modal  
  if (dropZone) dropZone.addEventListener("click", openModal);

  // Close button
  if (modalClose) modalClose.addEventListener("click", closeModal);

  // Click outside modal closes it
  if (modalOverlay) {
    modalOverlay.addEventListener("click", function(e) {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // ---- FILE SELECTION — ONE TRIGGER ONLY ----
  // Modal inner dropzone triggers file picker
  if (modalDropZone) {
    modalDropZone.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
  }

  // File input change — validate and show filename
  fileInput.addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;
    validateAndSelect(file);
    // Reset so same file can be re-selected
    fileInput.value = "";
  });

  // Drag and drop on modal dropzone
  if (modalDropZone) {
    modalDropZone.addEventListener("dragover", function(e) {
      e.preventDefault();
      modalDropZone.style.borderColor = "#000";
    });
    modalDropZone.addEventListener("dragleave", function() {
      modalDropZone.style.borderColor = "#ccc";
    });
    modalDropZone.addEventListener("drop", function(e) {
      e.preventDefault();
      modalDropZone.style.borderColor = "#ccc";
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    });
  }

  // ---- VALIDATION ----
  function validateAndSelect(file) {
    if (errorMsg) errorMsg.textContent = "";
    
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      if (errorMsg) errorMsg.textContent = "Please upload a valid PDF file.";
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      if (errorMsg) errorMsg.textContent = "File too large. Maximum size is 25MB.";
      return;
    }
    
    selectedFile = file;
    
    // Show filename in modal
    const fileNameDisplay = document.getElementById("selectedFileName") || document.getElementById("fileName");
    if (fileNameDisplay) {
      fileNameDisplay.textContent = "Selected: " + file.name + 
        " (" + (file.size / 1024 / 1024).toFixed(2) + " MB)";
      fileNameDisplay.classList.remove('hidden');
    }
  }

  // ---- UPLOAD SUBMIT — Navigate to editor ----
  if (uploadSubmitBtn) {
    uploadSubmitBtn.addEventListener("click", async function() {
      if (!selectedFile) {
        if (errorMsg) errorMsg.textContent = "Please select a PDF file first.";
        return;
      }
      
      // Show loading state
      uploadSubmitBtn.textContent = "Loading...";
      uploadSubmitBtn.disabled = true;

      try {
        // Clear old storage items
        sessionStorage.removeItem("inspiredpdf_data");
        sessionStorage.removeItem("inspiredpdf_storage");
        
        sessionStorage.setItem("inspiredpdf_filename", selectedFile.name);

        if (selectedFile.size < 3 * 1024 * 1024) {
          // use sessionStorage with base64
          const reader = new FileReader();
          reader.onload = function(e) {
            sessionStorage.setItem("inspiredpdf_data", e.target.result);
            window.location.href = "/editor";
          };
          reader.readAsDataURL(selectedFile);
        } else {
          // Use IndexedDB for larger files
          const reader = new FileReader();
          reader.onload = async function(e) {
            try {
              const arrayBuffer = e.target.result;
              await storePDFInIDB(arrayBuffer);
              sessionStorage.setItem("inspiredpdf_storage", "indexeddb");
              window.location.href = "/editor";
            } catch (err) {
              console.error("Failed to store in IndexedDB:", err);
              if (errorMsg) errorMsg.textContent = "Failed to store file locally. Try a smaller file.";
              uploadSubmitBtn.textContent = "Upload & Start Editing";
              uploadSubmitBtn.disabled = false;
            }
          };
          reader.readAsArrayBuffer(selectedFile);
        }
      } catch (err) {
        console.error("Upload process failed:", err);
        if (errorMsg) errorMsg.textContent = "Upload failed: " + err.message;
        uploadSubmitBtn.textContent = "Upload & Start Editing";
        uploadSubmitBtn.disabled = false;
      }
    });
  }

})();
