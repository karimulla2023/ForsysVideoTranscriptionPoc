from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import os
import whisper
import traceback
import requests
import re
import yt_dlp
import glob

app = Flask(__name__)
CORS(app)

# Load Whisper model once at startup
try:
    print("Loading Whisper model...")
    model = whisper.load_model("base")
    print("Whisper model loaded.")
except Exception as e:
    print("Failed to load Whisper model:", traceback.format_exc())
    model = None

GOOGLE_API_KEY = "AIzaSyANFmSG6aSlW81UkTy50js1iPI363kPypo"  # <-- Paste your Google API key here

@app.route('/transcribe', methods=['POST'])
def transcribe():
    print("Received /transcribe POST request")
    if 'file' not in request.files:
        print("No file uploaded")
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if file.filename == '':
        print("No selected file")
        return jsonify({'error': 'No selected file'}), 400
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name
    try:
        if model is None:
            raise RuntimeError("Whisper model not loaded. Check server logs for errors during startup.")
        print("Starting transcription for:", tmp_path)
        result = model.transcribe(tmp_path)
        print("Transcription complete.")
        transcript = result.get('text', '')
    except Exception as e:
        print('Exception during transcription:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        os.remove(tmp_path)
        print("Temporary file removed.")
    return jsonify({'transcript': transcript})

@app.route('/transcribe', methods=['GET'])
def transcribe_get():
    return "Use POST to upload a video for transcription."

def extract_gdrive_file_id(url):
    patterns = [
        r'drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)',
        r'drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

@app.route('/transcribe_gdrive', methods=['POST'])
def transcribe_gdrive():
    data = request.get_json()
    link = data.get('link')
    if not link:
        return jsonify({'error': 'No Google Drive link provided'}), 400

    file_id = extract_gdrive_file_id(link)
    if not file_id:
        return jsonify({'error': 'Invalid Google Drive link'}), 400

    download_url = f'https://drive.google.com/uc?export=download&id={file_id}'

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
            with requests.get(download_url, stream=True) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=8192):
                    tmp.write(chunk)
            tmp_path = tmp.name

        if model is None:
            raise RuntimeError("Whisper model not loaded. Check server logs for errors during startup.")
        result = model.transcribe(tmp_path)
        transcript = result.get('text', '')
    except Exception as e:
        print('Exception during GDrive transcription:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
    return jsonify({'transcript': transcript})

@app.route('/list_gdrive_folder', methods=['POST'])
def list_gdrive_folder():
    data = request.get_json()
    folder_link = data.get('folder_link')
    api_key = GOOGLE_API_KEY
    if not folder_link:
        return jsonify({'error': 'No Google Drive folder link provided'}), 400
    file_id = extract_gdrive_file_id(folder_link)
    if not file_id:
        # Try to extract folder id from folder link
        match = re.search(r'drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)', folder_link)
        if match:
            file_id = match.group(1)
        else:
            return jsonify({'error': 'Invalid Google Drive folder link'}), 400
    # List files in the folder
    try:
        url = f'https://www.googleapis.com/drive/v3/files'
        params = {
            'q': f"'{file_id}' in parents and trashed = false",
            'fields': 'files(id, name, mimeType)',
            'key': api_key
        }
        r = requests.get(url, params=params)
        r.raise_for_status()
        files = r.json().get('files', [])
        # Separate folders and video files
        folders = [f for f in files if f['mimeType'] == 'application/vnd.google-apps.folder']
        videos = [f for f in files if f['mimeType'].startswith('video/')]
        return jsonify({'folders': folders, 'videos': videos})
    except Exception as e:
        print('Exception during folder listing:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/transcribe_gdrive_file', methods=['POST'])
def transcribe_gdrive_file():
    data = request.get_json()
    file_id = data.get('file_id')
    api_key = GOOGLE_API_KEY
    if not file_id:
        return jsonify({'error': 'No file ID provided'}), 400
    # Get file metadata to determine file name and type
    meta_url = f'https://www.googleapis.com/drive/v3/files/{file_id}'
    meta_params = {'fields': 'name,mimeType', 'key': api_key}
    try:
        meta_resp = requests.get(meta_url, params=meta_params)
        meta_resp.raise_for_status()
        meta = meta_resp.json()
        if not meta['mimeType'].startswith('video/'):
            return jsonify({'error': 'Selected file is not a video.'}), 400
        # Download the file
        download_url = f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&key={api_key}'
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
            with requests.get(download_url, stream=True) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=8192):
                    tmp.write(chunk)
            tmp_path = tmp.name
        if model is None:
            raise RuntimeError("Whisper model not loaded. Check server logs for errors during startup.")
        result = model.transcribe(tmp_path)
        transcript = result.get('text', '')
    except Exception as e:
        print('Exception during GDrive file transcription:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
    return jsonify({'transcript': transcript})

@app.route('/transcribe_url', methods=['POST'])
def transcribe_url():
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    import shutil
    tmp_dir = tempfile.mkdtemp()
    transcript = None
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{tmp_dir}/%(title)s.%(ext)s',
            'quiet': True,
            'noplaylist': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
                'preferredquality': '192',
            }],
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            audio_path = os.path.splitext(filename)[0] + '.wav'
        if model is None:
            raise RuntimeError("Whisper model not loaded. Check server logs for errors during startup.")
        result = model.transcribe(audio_path)
        transcript = result.get('text', '')
    except Exception as e:
        print('Exception during URL transcription:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up all files in tmp_dir
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass
    return jsonify({'transcript': transcript})

@app.errorhandler(Exception)
def handle_exception(e):
    print('Global Exception:', traceback.format_exc())
    return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 