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

// Bind modal trigger buttons (Fix 3)
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
  
  // Wire drag & drop on landing page dropZone to open modal and handle file
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

// File validation, upload, and redirect (Fix 4)
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
    // Ensure user is signed in
    const user = await authPromise;
    const userId = user.uid;

    // Toggle loading screen
    modalLoading.classList.remove('hidden');
    modalFooter.classList.add('hidden');
    modalLoadingText.textContent = "Uploading PDF...";

    const timestamp = Date.now();
    const storagePath = `uploads/${userId}/${timestamp}_${selectedFile.name}`;
    const storageRef = ref(storage, storagePath);

    // 1. Upload bytes to Firebase Storage
    const snapshot = await uploadBytes(storageRef, selectedFile);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    // 2. Update loading screen to "Analyzing your PDF..."
    modalLoadingText.textContent = "Analyzing your PDF...";

    // 3. Create Firestore document (this will trigger analyzePDF automatically via onCreate)
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

    // Redirect to editor page using absolute path (Fix 6)
    window.location.href = `/editor?docId=${docRef.id}`;
  } catch (error) {
    console.error("Upload process failed:", error);
    showError(`Upload failed: ${error.message}`);
    modalLoading.classList.add('hidden');
    modalFooter.classList.remove('hidden');
  }
}

// Bind modal drop zone click and file input change (Fix 4)
if (modalDropZone) {
  modalDropZone.addEventListener("click", () => {
    pdfFileInput.click();
  });

  // Wire drag-and-drop on modalDropZone
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
