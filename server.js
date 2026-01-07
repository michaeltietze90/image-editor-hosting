const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage so we can process with sharp before saving
const upload = multer({ 
  storage: multer.memoryStorage(),
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
    label {
      display: block;
      margin-top: 15px;
      margin-bottom: 5px;
      color: #aaa;
      font-size: 14px;
    }
    input[type="file"], input[type="text"], input[type="number"], select {
      display: block;
      width: 100%;
      padding: 12px;
      margin: 5px 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      color: #fff;
    }
    .row {
      display: flex;
      gap: 15px;
    }
    .row > div {
      flex: 1;
    }
    input[type="text"]::placeholder, input[type="number"]::placeholder { color: #666; }
    button {
      background: #4ecdc4;
      color: #000;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
      margin-top: 15px;
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
    .delete-btn {
      background: #c44;
      padding: 8px 16px;
      font-size: 13px;
      margin-left: 10px;
    }
    .hint {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <h1>🖼️ Image Hosting</h1>
  
  <div class="upload-form">
    <form action="/upload" method="post" enctype="multipart/form-data">
      <label>Select Image</label>
      <input type="file" name="image" accept="image/*" required>
      
      <label>Custom Filename (optional)</label>
      <input type="text" name="customName" placeholder="my-image (without extension)">
      
      <label>Resize (optional - leave empty for original size)</label>
      <div class="row">
        <div>
          <input type="number" name="width" placeholder="Width (px)" min="1" max="4000">
        </div>
        <div>
          <input type="number" name="height" placeholder="Height (px)" min="1" max="4000">
        </div>
      </div>
      <p class="hint">Set only width or height to maintain aspect ratio</p>
      
      <label>Output Format (optional)</label>
      <select name="format">
        <option value="">Keep original</option>
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
      
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
          <button class="delete-btn" onclick="deleteImg('${img}')">Delete</button>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    function copyUrl(img) {
      const url = document.getElementById('url-' + img).textContent;
      navigator.clipboard.writeText(url);
    }
    function deleteImg(img) {
      if (confirm('Delete ' + img + '?')) {
        fetch('/delete/' + encodeURIComponent(img), { method: 'DELETE' })
          .then(() => location.reload());
      }
    }
  </script>
</body>
</html>
  `);
});

// Handle upload with resize
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const customName = req.body.customName;
    const width = req.body.width ? parseInt(req.body.width) : null;
    const height = req.body.height ? parseInt(req.body.height) : null;
    const format = req.body.format || null;

    // Determine filename
    let ext = path.extname(req.file.originalname).toLowerCase();
    if (format) {
      ext = '.' + format;
    }
    const baseName = customName || path.basename(req.file.originalname, path.extname(req.file.originalname));
    const filename = baseName + ext;
    const outputPath = path.join(uploadsDir, filename);

    // Process image with sharp
    let sharpInstance = sharp(req.file.buffer);

    // Resize if dimensions provided
    if (width || height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Convert format if specified
    if (format === 'png') {
      sharpInstance = sharpInstance.png();
    } else if (format === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: 85 });
    } else if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: 85 });
    }

    // Save the processed image
    await sharpInstance.toFile(outputPath);

    const imageUrl = `${req.protocol}://${req.get('host')}/${filename}`;
    
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
    .info {
      color: #888;
      font-size: 14px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1>✅ Uploaded!</h1>
    <img src="/${filename}?t=${Date.now()}" alt="Uploaded image">
    <div class="url" id="imageUrl">${imageUrl}</div>
    <button onclick="navigator.clipboard.writeText('${imageUrl}')">Copy URL</button>
    <p class="info">${width || height ? `Resized to ${width || 'auto'}x${height || 'auto'}` : 'Original size'}${format ? ` • Converted to ${format.toUpperCase()}` : ''}</p>
    <br>
    <a href="/">← Back to upload</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing image: ' + err.message);
  }
});

// Delete image
app.delete('/delete/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(uploadsDir, filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Image hosting running on port ${PORT}`);
});
