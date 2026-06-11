import { db, storage, authPromise } from './app.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// DOM Elements
const uploadStartBtn = document.getElementById('upload-start-btn');
const navTryBtn = document.getElementById('nav-try-btn');
const mainDropZone = document.getElementById('drop-zone');
const modalOverlay = document.getElementById('modalOverlay');
const closeBtn = document.getElementById('closeBtn');
const fileInput = document.getElementById('fileUpload');
const fileNameDisplay = document.getElementById('fileName');
const modalDragZone = document.getElementById('modal-drag-zone');
const uploadBtn = document.getElementById('uploadBtn');
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

function hideError() {
  uploadError.textContent = '';
  uploadError.classList.add('hidden');
}

// Modal open/close actions
function openModal() {
  modalOverlay.style.display = 'flex';
  hideError();
  selectedFile = null;
  fileInput.value = '';
  fileNameDisplay.textContent = '';
  fileNameDisplay.classList.add('hidden');
  modalLoading.classList.add('hidden');
  modalFooter.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.style.display = 'none';
}

if (uploadStartBtn) uploadStartBtn.addEventListener('click', openModal);
if (navTryBtn) navTryBtn.addEventListener('click', openModal);
if (closeBtn) closeBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// File validation & selection
function validateAndSelectFile(file) {
  if (!file) return;

  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    showError('Please upload a valid PDF file.');
    selectedFile = null;
    fileNameDisplay.classList.add('hidden');
    return;
  }

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
}

// Drag & Drop event bindings
function bindDragEvents(element) {
  if (!element) return;
  
  ['dragenter', 'dragover'].forEach(eventName => {
    element.addEventListener(eventName, (e) => {
      e.preventDefault();
      element.classList.add('bg-primary-fixed', 'active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    element.addEventListener(eventName, (e) => {
      e.preventDefault();
      element.classList.remove('bg-primary-fixed', 'active');
    }, false);
  });

  element.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      if (modalOverlay.style.display !== 'flex') {
        openModal();
      }
      validateAndSelectFile(files[0]);
    }
  });
}

bindDragEvents(mainDropZone);
bindDragEvents(modalDragZone);

// Handle file input selection
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelectFile(e.target.files[0]);
    }
  });
}

// Start upload on button click
if (uploadBtn) {
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      showError('Please select a valid PDF file.');
      return;
    }
    
    try {
      // Ensure user is signed in
      const user = await authPromise;
      const userId = user.uid;
      
      // Toggle loading screen
      modalLoading.classList.remove('hidden');
      modalFooter.classList.add('hidden');
      
      const timestamp = Date.now();
      const storagePath = `uploads/${userId}/${timestamp}_${selectedFile.name}`;
      const storageRef = ref(storage, storagePath);
      
      // 1. Upload bytes
      modalLoadingText.textContent = "Uploading PDF...";
      const snapshot = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      
      // 2. Create Firestore document (this will trigger analyzePDF automatically via onCreate)
      modalLoadingText.textContent = "Analyzing your PDF...";
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
      
      // Redirect to editor
      window.location.href = `/editor?docId=${docRef.id}`;
    } catch (error) {
      console.error("Upload process failed:", error);
      showError(`Upload failed: ${error.message}`);
      modalLoading.classList.add('hidden');
      modalFooter.classList.remove('hidden');
    }
  });
}
