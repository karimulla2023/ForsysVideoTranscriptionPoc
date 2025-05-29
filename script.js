document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('file-input');
    const mainContent = document.getElementById('main-content');
    const showOptionsBtn = document.getElementById('show-options-btn');

    const tabData = [
        {
            id: 'tab-gdrive-video',
            label: 'Google Drive Video Link',
            content: `<div class='tab-step'>
                Paste your Google Drive video link below:<br>
                <input class='input-box' id='gdrive-link-input' type='text' placeholder='https://drive.google.com/...'>
                <button class='upload-btn' id='gdrive-transcribe-btn'>Transcribe</button>
                <div id='gdrive-transcript-result'></div>
            </div>`
        },
        {
            id: 'tab-gdrive-folder',
            label: 'Google Drive Folder Link',
            content: `<div class='tab-step'>
                Paste your Google Drive folder link below:<br>
                <input class='input-box' id='gdrive-folder-link-input' type='text' placeholder='https://drive.google.com/drive/folders/...'>
                <button class='upload-btn' id='gdrive-folder-list-btn'>Browse Folder</button>
                <div id='gdrive-folder-browser'></div>
            </div>`
        },
        {
            id: 'tab-local',
            label: 'Upload from Local',
            content: `<div class='tab-step'>
                <label for='local-file-input' class='file-label'>Select a video file from your computer:</label>
                <input class='input-box file-input' id='local-file-input' type='file' accept='video/*'>
                <div id='transcript-result'></div>
            </div>`
        },
        {
            id: 'tab-other',
            label: 'Other Source Link',
            content: `<div class='tab-step'>
                Paste your video link from other sources below:<br>
                <input class='input-box' id='other-link-input' type='text' placeholder='https://...'>
                <button class='upload-btn' id='other-transcribe-btn'>Transcribe</button>
                <div id='other-transcript-result'></div>
            </div>`
        }
    ];

    showOptionsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        mainContent.innerHTML = `
            <div id="dialog-box" class="dialog-box">
                <div class="tab-header">
                    ${tabData.map((tab, i) => `<button class="tab-btn${i===0?' active':''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
                </div>
                <div class="tab-content-area">
                    ${tabData[0].content}
                </div>
            </div>
        `;
        // Tab switching logic
        const tabBtns = mainContent.querySelectorAll('.tab-btn');
        const tabContentArea = mainContent.querySelector('.tab-content-area');
        function setupLocalFileInput() {
            const localFileInput = tabContentArea.querySelector('#local-file-input');
            const fileLabel = tabContentArea.querySelector('.file-label');
            const transcriptResult = tabContentArea.querySelector('#transcript-result');
            if (localFileInput && fileLabel) {
                fileLabel.classList.add('highlight');
                localFileInput.addEventListener('focus', function() {
                    fileLabel.classList.add('highlight');
                });
                localFileInput.addEventListener('blur', function() {
                    fileLabel.classList.remove('highlight');
                });
                localFileInput.addEventListener('change', function() {
                    if (localFileInput.files.length > 0) {
                        const file = localFileInput.files[0];
                        transcriptResult.innerHTML = '<div class="loading-spinner"></div> <span>Transcribing, please wait...</span>';
                        const formData = new FormData();
                        formData.append('file', file);
                        fetch('http://127.0.0.1:5000/transcribe', {
                            method: 'POST',
                            body: formData
                        })
                        .then(async response => {
                            let data;
                            try {
                                data = await response.json();
                            } catch (e) {
                                throw new Error('Server error or invalid response. Check backend logs.');
                            }
                            if (data.transcript) {
                                transcriptResult.innerHTML = `<div class='transcript-box'><b>Transcript:</b><br>${data.transcript}</div>`;
                            } else if (data.error) {
                                transcriptResult.innerHTML = `<span class='error-msg'>${data.error}</span>`;
                            } else {
                                transcriptResult.innerHTML = `<span class='error-msg'>No transcript returned.</span>`;
                            }
                        })
                        .catch(err => {
                            transcriptResult.innerHTML = `<span class='error-msg'>Error: ${err.message}</span>`;
                        });
                    }
                });
            }
        }
        function setupGDriveLinkInput() {
            const gdriveBtn = tabContentArea.querySelector('#gdrive-transcribe-btn');
            const gdriveInput = tabContentArea.querySelector('#gdrive-link-input');
            const transcriptResult = tabContentArea.querySelector('#gdrive-transcript-result');
            if (gdriveBtn && gdriveInput) {
                gdriveBtn.addEventListener('click', function() {
                    const link = gdriveInput.value.trim();
                    if (!link) {
                        transcriptResult.innerHTML = `<span class='error-msg'>Please enter a Google Drive video link.</span>`;
                        return;
                    }
                    transcriptResult.innerHTML = '<div class="loading-spinner"></div> <span>Transcribing, please wait...</span>';
                    fetch('http://127.0.0.1:5000/transcribe_gdrive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ link })
                    })
                    .then(async response => {
                        let data;
                        try {
                            data = await response.json();
                        } catch (e) {
                            throw new Error('Server error or invalid response. Check backend logs.');
                        }
                        if (data.transcript) {
                            transcriptResult.innerHTML = `<div class='transcript-box'><b>Transcript:</b><br>${data.transcript}</div>`;
                        } else if (data.error) {
                            transcriptResult.innerHTML = `<span class='error-msg'>${data.error}</span>`;
                        } else {
                            transcriptResult.innerHTML = `<span class='error-msg'>No transcript returned.</span>`;
                        }
                    })
                    .catch(err => {
                        transcriptResult.innerHTML = `<span class='error-msg'>Error: ${err.message}</span>`;
                    });
                });
            }
        }
        function setupGDriveFolderInput() {
            const folderBtn = tabContentArea.querySelector('#gdrive-folder-list-btn');
            const folderInput = tabContentArea.querySelector('#gdrive-folder-link-input');
            const browserDiv = tabContentArea.querySelector('#gdrive-folder-browser');
            let currentFolderLink = null;
            let folderStack = [];
            function renderBrowser(folders, videos) {
                let html = '';
                if (folderStack.length > 0) {
                    html += `<button class='upload-btn' id='gdrive-folder-back-btn'>⬅ Back</button>`;
                }
                if (folders.length > 0) {
                    html += `<div><b>Folders:</b></div><ul>`;
                    folders.forEach(f => {
                        html += `<li><button class='option-btn gdrive-folder-btn' data-id='${f.id}' data-name='${f.name}'>${f.name}</button></li>`;
                    });
                    html += `</ul>`;
                }
                if (videos.length > 0) {
                    html += `<div><b>Video Files:</b></div><ul>`;
                    videos.forEach(v => {
                        html += `<li><button class='option-btn gdrive-video-btn' data-id='${v.id}' data-name='${v.name}'>${v.name}</button></li>`;
                    });
                    html += `</ul>`;
                }
                browserDiv.innerHTML = html;
                // Add event listeners for folders
                browserDiv.querySelectorAll('.gdrive-folder-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        folderStack.push({link: currentFolderLink, id: btn.dataset.id, name: btn.dataset.name});
                        fetchFolder(btn.dataset.id);
                    });
                });
                // Add event listeners for videos
                browserDiv.querySelectorAll('.gdrive-video-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        browserDiv.innerHTML = '<div class="loading-spinner"></div> <span>Transcribing, please wait...</span>';
                        fetch('http://127.0.0.1:5000/transcribe_gdrive_file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file_id: btn.dataset.id })
                        })
                        .then(async response => {
                            let data;
                            try {
                                data = await response.json();
                            } catch (e) {
                                throw new Error('Server error or invalid response. Check backend logs.');
                            }
                            if (data.transcript) {
                                browserDiv.innerHTML = `<div class='transcript-box'><b>Transcript:</b><br>${data.transcript}</div>`;
                            } else if (data.error) {
                                browserDiv.innerHTML = `<span class='error-msg'>${data.error}</span>`;
                            } else {
                                browserDiv.innerHTML = `<span class='error-msg'>No transcript returned.</span>`;
                            }
                        })
                        .catch(err => {
                            browserDiv.innerHTML = `<span class='error-msg'>Error: ${err.message}</span>`;
                        });
                    });
                });
                // Back button
                const backBtn = browserDiv.querySelector('#gdrive-folder-back-btn');
                if (backBtn) {
                    backBtn.addEventListener('click', function() {
                        folderStack.pop();
                        if (folderStack.length === 0) {
                            fetchFolder(currentFolderLink, true);
                        } else {
                            fetchFolder(folderStack[folderStack.length-1].id);
                        }
                    });
                }
            }
            function fetchFolder(folderIdOrLink, isRoot) {
                browserDiv.innerHTML = '<div class="loading-spinner"></div> <span>Loading folder...</span>';
                fetch('http://127.0.0.1:5000/list_gdrive_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder_link: folderIdOrLink })
                })
                .then(async response => {
                    let data;
                    try {
                        data = await response.json();
                    } catch (e) {
                        throw new Error('Server error or invalid response. Check backend logs.');
                    }
                    if (data.folders || data.videos) {
                        renderBrowser(data.folders || [], data.videos || []);
                    } else if (data.error) {
                        browserDiv.innerHTML = `<span class='error-msg'>${data.error}</span>`;
                    } else {
                        browserDiv.innerHTML = `<span class='error-msg'>No files found.</span>`;
                    }
                })
                .catch(err => {
                    browserDiv.innerHTML = `<span class='error-msg'>Error: ${err.message}</span>`;
                });
            }
            if (folderBtn && folderInput) {
                folderBtn.addEventListener('click', function() {
                    const link = folderInput.value.trim();
                    if (!link) {
                        browserDiv.innerHTML = `<span class='error-msg'>Please enter a Google Drive folder link.</span>`;
                        return;
                    }
                    currentFolderLink = link;
                    folderStack = [];
                    fetchFolder(link, true);
                });
            }
        }
        function setupOtherSourceInput() {
            const otherBtn = tabContentArea.querySelector('#other-transcribe-btn');
            const otherInput = tabContentArea.querySelector('#other-link-input');
            const transcriptResult = tabContentArea.querySelector('#other-transcript-result');
            if (otherBtn && otherInput) {
                otherBtn.addEventListener('click', function() {
                    const url = otherInput.value.trim();
                    if (!url) {
                        transcriptResult.innerHTML = `<span class='error-msg'>Please enter a video link.</span>`;
                        return;
                    }
                    transcriptResult.innerHTML = '<div class="loading-spinner"></div> <span>Transcribing, please wait...</span>';
                    fetch('http://127.0.0.1:5000/transcribe_url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    })
                    .then(async response => {
                        let data;
                        try {
                            data = await response.json();
                        } catch (e) {
                            throw new Error('Server error or invalid response. Check backend logs.');
                        }
                        if (data.transcript) {
                            transcriptResult.innerHTML = `<div class='transcript-box'><b>Transcript:</b><br>${data.transcript}</div>`;
                        } else if (data.error) {
                            transcriptResult.innerHTML = `<span class='error-msg'>${data.error}</span>`;
                        } else {
                            transcriptResult.innerHTML = `<span class='error-msg'>No transcript returned.</span>`;
                        }
                    })
                    .catch(err => {
                        transcriptResult.innerHTML = `<span class='error-msg'>Error: ${err.message}</span>`;
                    });
                });
            }
        }
        tabBtns.forEach((btn, i) => {
            btn.addEventListener('click', function() {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tabContentArea.classList.add('fade');
                setTimeout(() => {
                    tabContentArea.innerHTML = tabData[i].content;
                    tabContentArea.classList.remove('fade');
                    if (tabData[i].id === 'tab-local') {
                        setupLocalFileInput();
                    }
                    if (tabData[i].id === 'tab-gdrive-video') {
                        setupGDriveLinkInput();
                    }
                    if (tabData[i].id === 'tab-gdrive-folder') {
                        setupGDriveFolderInput();
                    }
                    if (tabData[i].id === 'tab-other') {
                        setupOtherSourceInput();
                    }
                }, 200);
            });
        });
        // If default tab is local, add highlight and event
        if (tabData[0].id === 'tab-local') {
            setupLocalFileInput();
        }
        if (tabData[0].id === 'tab-gdrive-video') {
            setupGDriveLinkInput();
        }
        if (tabData[0].id === 'tab-gdrive-folder') {
            setupGDriveFolderInput();
        }
        if (tabData[0].id === 'tab-other') {
            setupOtherSourceInput();
        }
    });
}); 