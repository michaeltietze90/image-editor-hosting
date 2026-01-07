const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Keep original filename or use custom name from form
    const customName = req.body.customName;
    if (customName) {
      const ext = path.extname(file.originalname);
      cb(null, customName + ext);
    } else {
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

// Serve uploaded images directly at root level: /imagename.png
app.use(express.static(uploadsDir));

// Upload page
app.get('/', (req, res) => {
  // List existing images
  const images = fs.readdirSync(uploadsDir).filter(f => 
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)
  );

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Image Hosting</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px; 
      margin: 0 auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
    }
    h1 { color: #4ecdc4; margin-bottom: 30px; }
    .upload-form {
      background: #1a1a1a;
      padding: 25px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #333;
    }
    input[type="file"], input[type="text"] {
      display: block;
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      color: #fff;
    }
    input[type="text"]::placeholder { color: #666; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
      margin-top: 10px;
    }
    button:hover { background: #3dbdb5; }
    .images { margin-top: 30px; }
    .image-item {
      background: #1a1a1a;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .image-item img { 
      max-width: 150px; 
      max-height: 100px;
      border-radius: 4px;
      vertical-align: middle;
      margin-right: 15px;
    }
    .url-box {
      background: #2a2a2a;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 14px;
      color: #4ecdc4;
      display: inline-block;
      margin-top: 10px;
      word-break: break-all;
    }
    .copy-btn {
      background: #555;
      padding: 8px 16px;
      font-size: 13px;
      margin-left: 10px;
    }
    .success {
      background: #1a3a2a;
      border: 1px solid #4ecdc4;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>🖼️ Image Hosting</h1>
  
  <div class="upload-form">
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="image" accept="image/*" required>
      <input type="text" name="customName" placeholder="Custom filename (optional, without extension)">
      <button type="submit">Upload Image</button>
    </form>
  </div>

  <div class="images">
    <h2>Hosted Images (${images.length})</h2>
    ${images.length === 0 ? '<p style="color:#666">No images uploaded yet</p>' : ''}
    ${images.map(img => `
      <div class="image-item">
        <img src="/${img}" alt="${img}">
        <strong>${img}</strong>
        <div>
          <span class="url-box" id="url-${img}">${req.protocol}://${req.get('host')}/${img}</span>
          <button class="copy-btn" onclick="copyUrl('${img}')">Copy</button>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    function copyUrl(img) {
      const url = document.getElementById('url-' + img).textContent;
      navigator.clipboard.writeText(url);
    }
  </script>
</body>
</html>
  `);
});

// Handle upload
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  const imageUrl = `${req.protocol}://${req.get('host')}/${req.file.filename}`;
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Upload Success</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 600px; 
      margin: 50px auto; 
      padding: 20px;
      background: #0f0f0f;
      color: #e0e0e0;
      text-align: center;
    }
    .success-box {
      background: #1a3a2a;
      border: 2px solid #4ecdc4;
      padding: 30px;
      border-radius: 12px;
    }
    h1 { color: #4ecdc4; }
    img { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 20px 0; }
    .url {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      word-break: break-all;
      color: #4ecdc4;
      margin: 20px 0;
    }
    a { color: #4ecdc4; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      margin: 10px;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1>✅ Uploaded!</h1>
    <img src="/${req.file.filename}" alt="Uploaded image">
    <div class="url" id="imageUrl">${imageUrl}</div>
    <button onclick="navigator.clipboard.writeText('${imageUrl}')">Copy URL</button>
    <br><br>
    <a href="/">← Back to upload</a>
  </div>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Image hosting running on port ${PORT}`);
});


