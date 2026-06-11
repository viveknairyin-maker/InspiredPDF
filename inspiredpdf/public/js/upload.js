import { db, storage, authPromise } from './app.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

let selectedFile = null;

// Helpers to show/hide error
function showError(message) {
  uploadError.textContent = message;
  uploadError.classList.remove('hidden');
}

// Modal open/close actions
function openModal() {
  modalOverlay.style.display = 'flex';
  uploadError.textContent = '';
  uploadError.classList.add('hidden');
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

// 1. Landing page triggers only open the modal (Fix Bug 2)
if (uploadBtn) {
  uploadBtn.addEventListener("click", openModal);
}

if (dropZone) {
  dropZone.addEventListener("click", openModal);
  
  // Drag over dropZone on landing page opens modal and loads file
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    openModal();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

if (modalClose) {
  modalClose.addEventListener("click", closeModal);
}

// Modal overlay only closes the modal
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    closeModal();
  }
});

// 2. ONLY the modal's inner drop zone triggers the file input (Fix Bug 2)
if (modalDropZone) {
  modalDropZone.addEventListener("click", (e) => {
    e.stopPropagation();
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

// Hidden file input change listener
if (pdfFileInput) {
  pdfFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
}

// Handle file selection, upload, and redirection
async function handleFile(file) {
  if (!file) return;

  // Validate type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showError('Please upload a valid PDF file.');
    selectedFile = null;
    fileNameDisplay.classList.add('hidden');
    return;
  }

  // Validate size (25MB limit)
  if (file.size > 25 * 1024 * 1024) {
    showError('File too large. Maximum size is 25MB.');
    selectedFile = null;
    fileNameDisplay.classList.add('hidden');
    return;
  }

  selectedFile = file;
  fileNameDisplay.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  fileNameDisplay.classList.remove('hidden');

  try {
    // Ensure user is signed in
    const user = await authPromise;
    const userId = user.uid;

    // Show loading overlay inside modal
    modalLoading.classList.remove('hidden');
    modalFooter.classList.add('hidden');
    modalLoadingText.textContent = "Uploading PDF...";

    const timestamp = Date.now();
    const storagePath = `uploads/${userId}/${timestamp}_${selectedFile.name}`;
    const storageRef = ref(storage, storagePath);

    // Upload bytes to Firebase Storage
    const snapshot = await uploadBytes(storageRef, selectedFile);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    // Set loading text
    modalLoadingText.textContent = "Analyzing your PDF...";

    // Create Firestore document (triggers analyzePDF onCreate)
    const docRef = await addDoc(collection(db, 'documents'), {
      userId: userId,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      uploadedAt: serverTimestamp(),
      storageUrl: downloadUrl,
      storagePath: storagePath,
      status: "processing"
    });

    console.log(`Document created with ID: ${docRef.id}`);

    // Redirect to editor using absolute path (bypasses 404s)
    window.location.href = `/editor.html?docId=${docRef.id}`;
  } catch (error) {
    console.error("Upload process failed:", error);
    showError(`Upload failed: ${error.message}`);
    modalLoading.classList.add('hidden');
    modalFooter.classList.remove('hidden');
  }
}
